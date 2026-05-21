import { Router, type Request, type Response } from 'express';
import { db, type Row } from '../db/connection.js';
import { markOrderPaid } from '../services/markOrderPaid.js';
import {
  createSwishPaymentRequest,
  getSwishPaymentRequest,
  isSwishConfigured,
  parseSwishAmountToOre,
  swishPaymentPageUrl,
} from '../services/swishClient.js';
import { isSwishPayment, normalizeSwishPayerAlias } from '../utils/paymentMethod.js';

async function fetchOrder(id: string): Promise<Row | null> {
  const [rows] = (await db.query('SELECT * FROM orders WHERE id = ?', [id])) as [Row[], unknown];
  const list = Array.isArray(rows) ? rows : [];
  return list[0] ?? null;
}

const router = Router();

router.post('/:orderId', async (req: Request, res: Response) => {
  try {
    if (!isSwishConfigured()) {
      res.status(503).json({ error: 'Swish-betalning är inte konfigurerad.' });
      return;
    }

    const orderId = req.params.orderId;
    const order = await fetchOrder(orderId);
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

    const body = req.body as { phone?: string };
    const phoneRaw = String(body?.phone ?? order.customer_phone ?? '').trim();
    const payerAlias = phoneRaw ? normalizeSwishPayerAlias(phoneRaw) : undefined;

    const { instructionId, token, status } = await createSwishPaymentRequest({
      totalOre,
      orderNumber: String(order.order_number ?? ''),
      payerAlias,
      payeePaymentReference: orderId.slice(0, 35),
    });

    await db.query('UPDATE orders SET swish_instruction_id = ? WHERE id = ?', [instructionId, orderId]);

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
    const msg = e instanceof Error ? e.message : 'Failed to create Swish payment';
    res.status(500).json({ error: msg });
  }
});

router.get('/:orderId/status', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.orderId;
    const order = await fetchOrder(orderId);
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
      const paidOre =
        typeof pr.amount === 'number' ? parseSwishAmountToOre(pr.amount) : undefined;
      await markOrderPaid(orderId, { paidAmountOre: paidOre });
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
