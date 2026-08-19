import { Router, type Request, type Response } from 'express';
import type { CreateOrderRefundResult } from '../shared/types/index.js';
import { requireAdmin, type JwtPayload } from '../middleware/auth.js';
import {
  createRateLimiter,
  getTrustedClientIp,
  hashRateLimitIdentifier,
} from '../middleware/rateLimit.js';
import {
  finalizeOrderRefund,
  getAdminRefundOverview,
  getRefundRecord,
  reserveOrderRefund,
  setRefundProviderReference,
  type ReservedRefund,
} from '../db/refundRepository.js';
import {
  createStripeOrderRefund,
  createSwishOrderRefund,
  type ProviderRefundOutcome,
} from '../services/refundProviders.js';
import {
  parseRefundIdempotencyKey,
  parseRefundRequest,
  RefundInputError,
} from '../utils/refundSelection.js';
import {
  isRefundPasswordConfigured,
  verifyRefundPassword,
} from '../utils/refundAuthorization.js';
import { isCanonicalUuidV4 } from '../utils/resourceId.js';
import { logUnexpectedError } from '../utils/safeErrorMetadata.js';

const router = Router();

const refundLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: 'För många återbetalningsförsök. Vänta en stund och försök igen.',
  prefix: 'admin-refund',
  keyGenerator: (req) => hashRateLimitIdentifier(
    `${getTrustedClientIp(req)}:${req.params.id ?? 'missing'}`
  ),
});

router.param('id', (req, res, next, value) => {
  if (!isCanonicalUuidV4(value)) {
    res.status(400).json({ error: 'Invalid resource identifier' });
    return;
  }
  next();
});

function adminPayload(req: Request): JwtPayload {
  const admin = (req as Request & { admin?: JwtPayload }).admin;
  if (!admin) throw new Error('Authenticated admin payload is missing');
  return admin;
}

function resultFromOverview(
  refundId: string,
  amount: number,
  overview: NonNullable<Awaited<ReturnType<typeof getAdminRefundOverview>>>
): CreateOrderRefundResult {
  const attempt = overview.attempts.find((candidate) => candidate.id === refundId);
  if (!attempt) throw new Error('Refund attempt was not visible after provider processing');
  return {
    refundId,
    amount,
    status: attempt.status,
    refundStatus: overview.refundStatus,
  };
}

async function callProvider(
  reservation: ReservedRefund,
  orderId: string,
  totalPaidOre: number
): Promise<ProviderRefundOutcome> {
  if (reservation.provider === 'stripe') {
    if (!reservation.stripeCheckoutSessionId) throw new Error('Stripe session is missing');
    return createStripeOrderRefund({
      refundId: reservation.refundId,
      orderId,
      sessionId: reservation.stripeCheckoutSessionId,
      totalPaidOre,
      amountOre: reservation.amountOre,
    });
  }
  if (!reservation.swishInstructionId) throw new Error('Swish instruction is missing');
  return createSwishOrderRefund({
    refundId: reservation.refundId,
    orderId,
    orderNumber: reservation.orderNumber,
    instructionId: reservation.swishInstructionId,
    totalPaidOre,
    amountOre: reservation.amountOre,
  });
}

router.get('/:id/refunds', requireAdmin, async (req: Request, res: Response) => {
  try {
    const overview = await getAdminRefundOverview(req.params.id);
    if (!overview) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    res.json(overview);
  } catch (error) {
    logUnexpectedError('GET /orders/admin/:id/refunds', error);
    res.status(500).json({ error: 'Kunde inte hämta återbetalningsinformation.' });
  }
});

router.post('/:id/refunds', refundLimiter, requireAdmin, async (req: Request, res: Response) => {
  let reserved: ReservedRefund | null = null;
  try {
    if (!isRefundPasswordConfigured()) {
      res.status(503).json({ error: 'Återbetalningslösenord är inte konfigurerat.' });
      return;
    }
    const before = await getAdminRefundOverview(req.params.id);
    if (!before) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    if (before.paymentStatus !== 'paid' || !['card', 'app', 'swish'].includes(before.paymentMethod)) {
      res.status(409).json({ error: 'Ordern har ingen återbetalningsbar onlinebetalning.' });
      return;
    }
    if (before.refundableAmount <= 0) {
      res.status(409).json({ error: 'Ordern saknar ett återbetalningsbart belopp.' });
      return;
    }

    const parsed = parseRefundRequest(req.body, before.orderNumber);
    if (!await verifyRefundPassword(parsed.password)) {
      res.status(401).json({ error: 'Felaktigt återbetalningslösenord.' });
      return;
    }
    const header = Array.isArray(req.headers['idempotency-key'])
      ? req.headers['idempotency-key'][0]
      : req.headers['idempotency-key'];
    const idempotencyKey = parseRefundIdempotencyKey(header);
    const admin = adminPayload(req);
    reserved = await reserveOrderRefund({
      orderId: before.orderId,
      adminId: admin.adminId,
      idempotencyKey,
      items: parsed.items,
    });

    if (!reserved.created) {
      const existing = await getRefundRecord(reserved.refundId);
      if (!existing) throw new Error('Idempotent refund reservation disappeared');
      if (existing.status !== 'pending' || existing.providerRefundId) {
        const replayOverview = await getAdminRefundOverview(before.orderId);
        if (!replayOverview) throw new Error('Order disappeared during refund replay');
        res.status(existing.status === 'pending' ? 202 : 200).json(
          resultFromOverview(existing.id, existing.amountOre, replayOverview)
        );
        return;
      }
    }

    const outcome = await callProvider(reserved, before.orderId, before.totalPrice);
    await setRefundProviderReference(reserved.refundId, outcome.providerRefundId);
    if (outcome.status !== 'pending') {
      await finalizeOrderRefund({
        refundId: reserved.refundId,
        succeeded: outcome.status === 'succeeded',
        failureCode: outcome.failureCode,
      });
    }
    const after = await getAdminRefundOverview(before.orderId);
    if (!after) throw new Error('Order disappeared after provider refund');
    res.status(outcome.status === 'pending' ? 202 : 200).json(
      resultFromOverview(reserved.refundId, reserved.amountOre, after)
    );
  } catch (error) {
    if (error instanceof RefundInputError) {
      res.status(400).json({ error: error.message });
      return;
    }
    logUnexpectedError('POST /orders/admin/:id/refunds', error);
    if (reserved) {
      // The provider may have accepted a request whose response was interrupted.
      // Keep the reservation pending and reuse the same idempotency key on retry.
      res.status(202).json({
        refundId: reserved.refundId,
        amount: reserved.amountOre,
        status: 'pending',
        refundStatus: 'pending',
      } satisfies CreateOrderRefundResult);
      return;
    }
    const code = String((error as { code?: unknown })?.code ?? '');
    res.status(code.startsWith('PGRST') ? 503 : 409).json({
      error: code.startsWith('PGRST')
        ? 'Återbetalningstjänsten är inte tillgänglig.'
        : 'Återbetalningen kunde inte reserveras.',
    });
  }
});

export default router;
