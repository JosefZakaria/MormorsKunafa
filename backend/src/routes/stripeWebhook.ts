import type { Request, Response } from 'express';
import type { ResultSetHeader } from 'mysql2/promise';
import Stripe from 'stripe';
import { db, type Row } from '../db/connection.js';
import { getStripe } from '../services/stripeClient.js';
import { sendOrderConfirmationEmail } from '../services/OrderConfirmationEmail.js';

async function getOrderById(id: string): Promise<{ order: Row; items: Row[] } | null> {
  const [orderRows] = (await db.query('SELECT * FROM orders WHERE id = ?', [id])) as [Row[], unknown];
  const orderList = Array.isArray(orderRows) ? orderRows : [];
  if (orderList.length === 0) return null;
  const [itemRows] = (await db.query('SELECT * FROM order_items WHERE order_id = ?', [id])) as [Row[], unknown];
  return { order: orderList[0], items: Array.isArray(itemRows) ? itemRows : [] };
}

async function markOrderPaidFromSession(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = session.metadata?.orderId?.trim();
  if (!orderId) {
    console.warn('[stripe webhook] checkout.session.completed missing metadata.orderId');
    return;
  }

  const amountTotal = session.amount_total;
  if (typeof amountTotal !== 'number') {
    console.warn('[stripe webhook] missing amount_total on session', session.id);
    return;
  }

  const result = await getOrderById(orderId);
  if (!result) {
    console.warn('[stripe webhook] order not found', orderId);
    return;
  }

  const expectedOre = Number(result.order.total_ore ?? 0);
  if (expectedOre > 0 && amountTotal !== expectedOre) {
    console.error('[stripe webhook] amount mismatch', { orderId, amountTotal, expectedOre, sessionId: session.id });
    return;
  }

  const [updateResult] = (await db.query(
    `UPDATE orders SET payment_status = 'paid', updated_at = NOW() WHERE id = ? AND payment_status = 'pending'`,
    [orderId]
  )) as [ResultSetHeader, unknown];

  const affected = Number(updateResult.affectedRows ?? 0);
  if (affected === 0) {
    return;
  }

  const refreshed = await getOrderById(orderId);
  if (!refreshed) return;

  const emailOut = String(refreshed.order.customer_email ?? '').trim();
  if (emailOut) {
    void sendOrderConfirmationEmail({ order: refreshed.order, items: refreshed.items }).catch((err) =>
      console.error('[order confirmation email after payment]', err)
    );
  }
}

export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set');
    res.status(503).send('Webhook not configured');
    return;
  }

  const sig = req.headers['stripe-signature'];
  if (!sig || typeof sig !== 'string') {
    res.status(400).send('Missing stripe-signature');
    return;
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[stripe webhook] signature verification failed:', msg);
    res.status(400).send(`Webhook Error: ${msg}`);
    return;
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === 'paid') {
        await markOrderPaidFromSession(session);
      }
    }
    res.json({ received: true });
  } catch (e) {
    console.error('[stripe webhook] handler error', e);
    res.status(500).send('Webhook handler failed');
  }
}
