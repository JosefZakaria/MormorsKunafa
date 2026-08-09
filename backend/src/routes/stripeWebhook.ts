import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { getStripe } from '../services/stripeClient.js';
import { markOrderPaid } from '../services/markOrderPaid.js';
import { getOrderById } from '../db/orderRepository.js';
import { validateStripeCheckoutSession } from '../utils/confirmStripeCheckout.js';
import {
  assertStripeWebhookSecret,
  isExpectedStripeEventMode,
  safeStripeVerificationError,
} from '../utils/stripeSecurity.js';
import { logUnexpectedError } from '../utils/safeErrorMetadata.js';

async function markOrderPaidFromSession(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = session.metadata?.orderId?.trim();
  if (!orderId) {
    console.warn('[stripe webhook] checkout.session.completed missing metadata.orderId');
    return;
  }

  const result = await getOrderById(orderId);
  if (!result) {
    console.warn('[stripe webhook] order not found', orderId);
    return;
  }

  const validation = validateStripeCheckoutSession(result.order, session);
  if (!validation.ok) {
    console.error('[stripe webhook] checkout validation failed', {
      sessionId: session.id,
      orderId,
      error: validation.error,
    });
    return;
  }

  await markOrderPaid(orderId, { paidAmountOre: validation.paidAmountOre });
}

export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set');
    res.status(503).send('Webhook not configured');
    return;
  }
  try {
    assertStripeWebhookSecret(secret);
  } catch {
    console.error('[stripe webhook] signing secret configuration is invalid');
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
    console.error('[stripe webhook] signature verification failed:', safeStripeVerificationError(err));
    res.status(400).send('Invalid webhook signature');
    return;
  }

  if (!isExpectedStripeEventMode(event.livemode)) {
    console.error('[stripe webhook] rejected non-live event in production', {
      eventId: event.id,
      eventType: event.type,
    });
    res.status(400).send('Webhook mode mismatch');
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
    logUnexpectedError('stripe webhook handler error', e);
    res.status(500).send('Webhook handler failed');
  }
}
