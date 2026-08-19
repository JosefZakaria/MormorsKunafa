import { Router, type Request, type Response } from 'express';
import type { JwtPayload } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  createRateLimiter,
  getTrustedClientIp,
  hashRateLimitIdentifier,
} from '../middleware/rateLimit.js';
import { getPaymentSecurityAlert } from '../db/paymentEventRepository.js';
import {
  finalizeDuplicateStripeRefund,
  getDuplicateStripeRefundByEvent,
  reserveDuplicateStripeRefund,
  setDuplicateStripeRefundProviderReference,
  type DuplicateStripeRefundRecord,
} from '../db/duplicateStripeRefundRepository.js';
import {
  createDuplicateStripeRefund,
  expectedDuplicateRefundConfirmation,
  getDuplicateStripePaymentContext,
} from '../services/duplicatePaymentRefunds.js';
import { getStripeRefundOutcome } from '../services/refundProviders.js';
import { isRefundPasswordConfigured, verifyRefundPassword } from '../utils/refundAuthorization.js';
import { parseRefundIdempotencyKey, RefundInputError } from '../utils/refundSelection.js';
import { logUnexpectedError } from '../utils/safeErrorMetadata.js';

const router = Router();
const EVENT_ID = /^evt_[A-Za-z0-9_]{8,255}$/;

const limiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: 'För många återbetalningsförsök. Vänta en stund och försök igen.',
  prefix: 'duplicate-stripe-refund',
  keyGenerator: (req) => hashRateLimitIdentifier(
    `${getTrustedClientIp(req)}:${req.params.eventId ?? 'missing'}`
  ),
});

router.param('eventId', (req, res, next, value) => {
  if (!EVENT_ID.test(value)) {
    res.status(400).json({ error: 'Invalid Stripe event identifier' });
    return;
  }
  next();
});

function adminPayload(req: Request): JwtPayload {
  const admin = (req as Request & { admin?: JwtPayload }).admin;
  if (!admin) throw new Error('Authenticated admin payload is missing');
  return admin;
}

function storedResult(record: DuplicateStripeRefundRecord, orderNumber?: string) {
  return {
    eventId: record.eventId,
    orderId: record.orderId,
    ...(orderNumber ? { orderNumber } : {}),
    amount: record.amountOre,
    status: record.status,
  };
}

router.get('/:eventId', requireAdmin, async (req: Request, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'private, no-store');
    const alert = await getPaymentSecurityAlert(req.params.eventId);
    if (!alert) {
      res.status(404).json({ error: 'Betalningslarmet hittades inte.' });
      return;
    }
    const stored = await getDuplicateStripeRefundByEvent(alert.eventId);
    if (stored) {
      res.json(storedResult(stored));
      return;
    }
    if (alert.outcome !== 'alert_paid_session_validation_failed' || !alert.orderId) {
      res.json({ eventId: alert.eventId, status: 'investigation_only' });
      return;
    }
    try {
      const context = await getDuplicateStripePaymentContext(alert.eventId);
      if (context.payment.orderId !== alert.orderId) {
        res.json({ eventId: alert.eventId, status: 'investigation_only' });
        return;
      }
      res.json({
        eventId: alert.eventId,
        orderId: context.payment.orderId,
        orderNumber: context.orderNumber,
        amount: context.payment.amountOre,
        status: 'eligible',
        confirmation: expectedDuplicateRefundConfirmation(context.orderNumber),
      });
    } catch {
      res.json({ eventId: alert.eventId, status: 'investigation_only' });
    }
  } catch (error) {
    logUnexpectedError('GET /admin/payment-alerts/:eventId', error);
    res.status(503).json({ error: 'Betalningslarmet kunde inte verifieras.' });
  }
});

router.post('/:eventId/refund', limiter, requireAdmin, async (req: Request, res: Response) => {
  let reserved: DuplicateStripeRefundRecord | null = null;
  try {
    if (!isRefundPasswordConfigured()) {
      res.status(503).json({ error: 'Återbetalningslösenord är inte konfigurerat.' });
      return;
    }
    const alert = await getPaymentSecurityAlert(req.params.eventId);
    if (
      !alert
      || alert.outcome !== 'alert_paid_session_validation_failed'
      || !alert.orderId
    ) {
      res.status(409).json({ error: 'Larmet är inte en verifierbar dubbelbetalning.' });
      return;
    }
    const context = await getDuplicateStripePaymentContext(alert.eventId);
    if (context.payment.orderId !== alert.orderId) {
      res.status(409).json({ error: 'Larmet matchar inte den verifierade ordern.' });
      return;
    }
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const confirmation = typeof req.body?.confirmation === 'string' ? req.body.confirmation : '';
    if (!password || password.length > 256) {
      res.status(400).json({ error: 'Återbetalningslösenord krävs.' });
      return;
    }
    if (confirmation !== expectedDuplicateRefundConfirmation(context.orderNumber)) {
      res.status(400).json({ error: 'Bekräftelsetexten stämmer inte med ordern.' });
      return;
    }
    if (!await verifyRefundPassword(password)) {
      res.status(401).json({ error: 'Felaktigt återbetalningslösenord.' });
      return;
    }
    const header = Array.isArray(req.headers['idempotency-key'])
      ? req.headers['idempotency-key'][0]
      : req.headers['idempotency-key'];
    const idempotencyKey = parseRefundIdempotencyKey(header);
    reserved = await reserveDuplicateStripeRefund({
      eventId: alert.eventId,
      orderId: context.payment.orderId,
      sessionId: context.payment.sessionId,
      paymentIntentId: context.payment.paymentIntentId,
      amountOre: context.payment.amountOre,
      adminId: adminPayload(req).adminId,
      idempotencyKey,
    });

    if (reserved.status !== 'pending') {
      res.json(storedResult(reserved, context.orderNumber));
      return;
    }
    const outcome = reserved.providerRefundId
      ? await getStripeRefundOutcome(reserved.providerRefundId)
      : await createDuplicateStripeRefund({
          refundId: reserved.id,
          eventId: reserved.eventId,
          payment: context.payment,
        });
    if (!reserved.providerRefundId) {
      await setDuplicateStripeRefundProviderReference(reserved.id, outcome.providerRefundId);
    }
    if (outcome.status !== 'pending') {
      await finalizeDuplicateStripeRefund({
        refundId: reserved.id,
        succeeded: outcome.status === 'succeeded',
        failureCode: outcome.failureCode,
      });
    }
    res.status(outcome.status === 'pending' ? 202 : 200).json({
      ...storedResult(reserved, context.orderNumber),
      status: outcome.status,
    });
  } catch (error) {
    if (error instanceof RefundInputError) {
      res.status(400).json({ error: error.message });
      return;
    }
    logUnexpectedError('POST /admin/payment-alerts/:eventId/refund', error);
    if (reserved) {
      res.status(202).json(storedResult(reserved));
      return;
    }
    res.status(409).json({ error: 'Dubbelbetalningen kunde inte återbetalas säkert.' });
  }
});

export default router;
