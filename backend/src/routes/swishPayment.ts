import { Router, type Request, type Response } from 'express';
import { supabase, type Row, logSupabaseError } from '../db/connection.js';
import { fetchOrderRow } from '../db/orderRepository.js';
import { markOrderPaid } from '../services/markOrderPaid.js';
import {
  createSwishPaymentRequest,
  getSwishPaymentRequest,
  isSwishConfigured,
  swishPaymentPageUrl,
  verifySwishPaymentRequest,
} from '../services/swishClient.js';
import { isSwishPayment, normalizeSwishPayerAlias } from '../utils/paymentMethod.js';
import { requireOrderStatusToken } from '../middleware/orderStatusToken.js';
import { createRateLimiter, getTrustedClientIp, hashRateLimitIdentifier } from '../middleware/rateLimit.js';

const router = Router();

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

router.post('/:orderId', swishStartLimiter, async (req: Request, res: Response) => {
  try {
    if (!isSwishConfigured()) {
      res.status(503).json({ error: 'Swish-betalning är inte konfigurerad.' });
      return;
    }

    const orderId = req.params.orderId;
    if (!requireOrderStatusToken(req, res, orderId)) return;
    const order = await fetchOrderRow(orderId);
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    if (!isSwishPayment(String(order.payment_method ?? ''))) {
      res.status(400).json({ error: 'Order does not use Swish payment' });
      return;
    }
    if (String(order.payment_status ?? '') !== 'pending') {
      res.status(400).json({ error: 'Order is not awaiting payment' });
      return;
    }

    const totalOre = Number(order.total_ore ?? 0);
    if (totalOre <= 0) {
      res.status(400).json({ error: 'Order has no payable total' });
      return;
    }

    // The payer alias comes only from the already validated order. Do not accept
    // a second, attacker-controlled phone number when starting the payment.
    const phoneRaw = String(order.customer_phone ?? '').trim();
    const payerAlias = phoneRaw ? normalizeSwishPayerAlias(phoneRaw) : undefined;

    const { instructionId, token, status } = await createSwishPaymentRequest({
      totalOre,
      orderNumber: String(order.order_number ?? ''),
      payerAlias,
      payeePaymentReference: orderId.slice(0, 35),
    });

    const { error } = await supabase
      .from('orders')
      .update({ swish_instruction_id: instructionId })
      .eq('id', orderId);

    if (error) {
      logSupabaseError('swish payment create update', error);
      res.status(500).json({ error: 'Failed to save Swish instruction' });
      return;
    }

    res.json({
      instructionId,
      status: status ?? 'CREATED',
      paymentPageUrl: token ? swishPaymentPageUrl(token) : undefined,
      token,
      amountOre: totalOre,
      orderNumber: order.order_number,
    });
  } catch (e) {
    console.error('[swish payment create]', e);
    res.status(500).json({ error: 'Failed to create Swish payment' });
  }
});

router.get('/:orderId/status', swishStatusLimiter, async (req: Request, res: Response) => {
  try {
    const orderId = req.params.orderId;
    if (!requireOrderStatusToken(req, res, orderId)) return;
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
      token: pr.paymentRequestToken,
      paymentPageUrl: pr.paymentRequestToken
        ? swishPaymentPageUrl(pr.paymentRequestToken)
        : undefined,
    });
  } catch (e) {
    console.error('[swish payment status]', e);
    res.status(500).json({ error: 'Failed to fetch Swish status' });
  }
});

export default router;
