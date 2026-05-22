import type Stripe from 'stripe';
import { getOrderById } from '../db/orderRepository.js';
import { markOrderPaid } from '../services/markOrderPaid.js';
import { getStripe } from '../services/stripeClient.js';

/**
 * After Stripe Checkout redirect, confirm payment server-side (backup if webhook is delayed).
 */
export async function confirmStripeCheckoutSession(
  orderId: string,
  sessionId: string
): Promise<{ ok: boolean; paymentStatus: string; error?: string }> {
  const result = await getOrderById(orderId);
  if (!result) {
    return { ok: false, paymentStatus: 'unknown', error: 'Order not found' };
  }

  const existingStatus = String(result.order.payment_status ?? '');
  if (existingStatus === 'paid') {
    return { ok: true, paymentStatus: 'paid' };
  }

  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch {
    return { ok: false, paymentStatus: existingStatus, error: 'Stripe is not configured' };
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, paymentStatus: existingStatus, error: `Invalid checkout session: ${msg}` };
  }

  const metaOrderId = session.metadata?.orderId?.trim();
  if (metaOrderId && metaOrderId !== orderId) {
    return { ok: false, paymentStatus: existingStatus, error: 'Session does not match order' };
  }

  const storedSessionId = String(result.order.stripe_checkout_session_id ?? '').trim();
  if (storedSessionId && storedSessionId !== sessionId) {
    return { ok: false, paymentStatus: existingStatus, error: 'Session id does not match order' };
  }

  if (session.payment_status !== 'paid') {
    return { ok: false, paymentStatus: existingStatus, error: 'Payment not completed yet' };
  }

  const amountTotal = session.amount_total;
  if (typeof amountTotal !== 'number') {
    return { ok: false, paymentStatus: existingStatus, error: 'Missing payment amount on session' };
  }

  await markOrderPaid(orderId, { paidAmountOre: amountTotal });
  return { ok: true, paymentStatus: 'paid' };
}
