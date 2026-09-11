import { Router, type Request, type Response } from 'express';
import { canStartOrderPayment } from '../utils/orderPaymentState.js';
import { supabase, type Row, logSupabaseError } from '../db/connection.js';
import { fetchOrderRow } from '../db/orderRepository.js';
import { markOrderPaid } from '../services/markOrderPaid.js';
import {
  createSwishPaymentRequest,
  getSwishPaymentRequest,
  isSwishConfigured,
  isSwishCheckoutEnabled,
  parseSwishInstructionId,
  resolveSwishInstructionId,
  SwishHttpError,
  swishPaymentPageUrl,
  verifySwishPaymentRequest,
  verifySwishPaymentRequestIdentity,
} from '../services/swishClient.js';
import { isSwishPayment, normalizeSwishPayerAlias } from '../utils/paymentMethod.js';
import { requireOrderStatusToken } from '../middleware/orderStatusToken.js';
import { createRateLimiter, getTrustedClientIp, hashRateLimitIdentifier } from '../middleware/rateLimit.js';
import { isCanonicalUuidV4 } from '../utils/resourceId.js';
import { logUnexpectedError } from '../utils/safeErrorMetadata.js';
import { singleRouteParam } from '../utils/routeParam.js';

const router = Router();

router.param('orderId', (_req, res, next, value) => {
  if (!isCanonicalUuidV4(value)) {
    res.status(400).json({ error: 'Invalid resource identifier' });
    return;
  }
  next();
});

const swishStartLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  prefix: 'swish-start',
  keyGenerator: (req) => hashRateLimitIdentifier(
    `${getTrustedClientIp(req)}:${String(req.headers['x-order-status-token'] ?? '')}`
  ),
});

const swishStatusLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 180,
  prefix: 'swish-status',
  keyGenerator: (req) => hashRateLimitIdentifier(
    `${getTrustedClientIp(req)}:${String(req.headers['x-order-status-token'] ?? '')}`
  ),
});

async function sendExistingPayment(
  res: Response,
  order: Row,
  instructionId: string
): Promise<void> {
  const payment = await getSwishPaymentRequest(instructionId);
  const identity = verifySwishPaymentRequestIdentity(payment, {
    instructionId, amountOre:Number(order.total_ore), payeeAlias:process.env.SWISH_PAYEE_ALIAS?.trim() ?? '',
    payeePaymentReference:String(order.id).slice(0,35),
  });
  if (!identity.ok) throw new Error('Existing Swish payment identity mismatch');
  res.json({
    instructionId,
    status: String(payment.status ?? 'CREATED').slice(0, 32),
    paymentPageUrl: payment.paymentRequestToken
      ? swishPaymentPageUrl(payment.paymentRequestToken)
      : undefined,
    amountOre: Number(order.total_ore ?? 0),
    orderNumber: order.order_number,
  });
}

router.post('/:orderId', swishStartLimiter, async (req: Request, res: Response) => {
  try {
    if (!isSwishCheckoutEnabled()) {
      res.status(503).json({ error: 'Swish-betalning är avstängd.' });
      return;
    }
    if (!isSwishConfigured()) {
      res.status(503).json({ error: 'Swish-betalning är inte konfigurerad.' });
      return;
    }

    const orderId = singleRouteParam(req.params.orderId);
    if (!await requireOrderStatusToken(req, res, orderId)) return;
    const order = await fetchOrderRow(orderId);
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    if (!isSwishPayment(String(order.payment_method ?? ''))) {
      res.status(400).json({ error: 'Order does not use Swish payment' });
      return;
    }
    if (!canStartOrderPayment(order)) {
      res.status(409).json({ error: 'Order is not eligible for payment' });
      return;
    }

    const totalOre = Number(order.total_ore ?? 0);
    if (totalOre <= 0) {
      res.status(400).json({ error: 'Order has no payable total' });
      return;
    }

    const storedInstructionRaw = String(order.swish_instruction_id ?? '').trim();
    const storedInstructionId = parseSwishInstructionId(storedInstructionRaw);
    if (storedInstructionRaw && !storedInstructionId) {
      res.status(409).json({ error: 'Order has an invalid stored Swish instruction' });
      return;
    }
    if (storedInstructionId) {
      await sendExistingPayment(res, order, storedInstructionId);
      return;
    }

    // The payer alias comes only from the already validated order. Do not accept
    // a second, attacker-controlled phone number when starting the payment.
    const phoneRaw = String(order.customer_phone ?? '').trim();
    const payerAlias = phoneRaw ? normalizeSwishPayerAlias(phoneRaw) : undefined;

    // Reserve the provider identifier before the external request. The conditional
    // update makes concurrent starts converge on one Swish payment request.
    const reservedInstructionId = resolveSwishInstructionId();
    const { data: reservationRows, error: reservationError } = await supabase
      .from('orders')
      .update({ swish_instruction_id: reservedInstructionId })
      .eq('id', orderId)
      .eq('status', 'ny')
      .eq('payment_status', 'pending')
      .is('swish_instruction_id', null)
      .select('swish_instruction_id');

    if (reservationError) {
      logSupabaseError('swish payment reserve instruction', reservationError);
      res.status(500).json({ error: 'Failed to reserve Swish instruction' });
      return;
    }
    if (!reservationRows?.length) {
      const latestOrder = await fetchOrderRow(orderId);
      const concurrentInstructionId = parseSwishInstructionId(
        latestOrder?.swish_instruction_id
      );
      if (!latestOrder || !canStartOrderPayment(latestOrder) || !concurrentInstructionId) {
        res.status(409).json({ error: 'Swish payment start conflicted; retry status' });
        return;
      }
      await sendExistingPayment(res, latestOrder, concurrentInstructionId);
      return;
    }

    const { instructionId, token, status } = await createSwishPaymentRequest({
      totalOre,
      orderNumber: String(order.order_number ?? ''),
      payerAlias,
      payeePaymentReference: orderId.slice(0, 35),
      instructionId: reservedInstructionId,
    });

    res.json({
      instructionId,
      status: status ?? 'CREATED',
      paymentPageUrl: token ? swishPaymentPageUrl(token) : undefined,
      amountOre: totalOre,
      orderNumber: order.order_number,
    });
  } catch (e) {
    logUnexpectedError('swish payment create', e);
    if (e instanceof SwishHttpError && e.statusCode === 404) {
      // Absence is not proof a prior transfer never happened. Keep the ID;
      // automatic recreation requires a verified provider retention contract.
      res.status(409).json({ code:'SWISH_RECONCILIATION_REQUIRED', error:'Det tidigare Swish-försöket kunde inte bekräftas. Kontakta butiken för avstämning.' });
      return;
    }
    res.status(500).json({ error: 'Failed to create Swish payment' });
  }
});

router.get('/:orderId/status', swishStatusLimiter, async (req: Request, res: Response) => {
  try {
    const orderId = singleRouteParam(req.params.orderId);
    if (!await requireOrderStatusToken(req, res, orderId)) return;
    const order = await fetchOrderRow(orderId);
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    if (String(order.payment_status ?? '') === 'paid') {
      res.json({ paymentStatus: 'paid', swishStatus: 'PAID' });
      return;
    }

    const instructionId = String(order.swish_instruction_id ?? '').trim();
    if (!instructionId || !isSwishConfigured()) {
      res.json({
        paymentStatus: order.payment_status,
        swishStatus: null,
      });
      return;
    }

    const pr = await getSwishPaymentRequest(instructionId);
    const swishStatus = String(pr.status ?? '').toUpperCase();

    const identity = verifySwishPaymentRequestIdentity(pr, {
      instructionId, amountOre:Number(order.total_ore ?? 0),
      payeeAlias:process.env.SWISH_PAYEE_ALIAS?.trim() ?? '', payeePaymentReference:orderId.slice(0,35),
    });
    if (!identity.ok) {
      res.status(409).json({error:'Swish-betalningen kunde inte verifieras.'});
      return;
    }
    if (swishStatus === 'PAID') {
      const verification = verifySwishPaymentRequest(pr, {
        instructionId,
        amountOre: Number(order.total_ore ?? 0),
        payeeAlias: process.env.SWISH_PAYEE_ALIAS?.trim() ?? '',
        payeePaymentReference: orderId.slice(0, 35),
      });
      if (!verification.ok) {
        console.error('[swish payment status] verification failed', {
          instructionId,
          reason: verification.reason,
        });
        res.status(409).json({
          paymentStatus: order.payment_status,
          swishStatus,
          error: 'Swish-betalningen kunde inte verifieras.',
        });
        return;
      }
      await markOrderPaid(orderId, { paidAmountOre: verification.paidAmountOre });
      res.json({ paymentStatus: 'paid', swishStatus: 'PAID' });
      return;
    }

    res.json({
      paymentStatus: order.payment_status,
      swishStatus: pr.status ?? null,
      paymentPageUrl: pr.paymentRequestToken
        ? swishPaymentPageUrl(pr.paymentRequestToken)
        : undefined,
    });
  } catch (e) {
    logUnexpectedError('swish payment status', e);
    res.status(500).json({ error: 'Failed to fetch Swish status' });
  }
});

export default router;
