import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { getStripe } from '../services/stripeClient.js';
import { markOrderPaid } from '../services/markOrderPaid.js';

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

  await markOrderPaid(orderId, { paidAmountOre: amountTotal });
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
