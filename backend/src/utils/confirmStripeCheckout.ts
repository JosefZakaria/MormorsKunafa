import type Stripe from 'stripe';
import type { Row } from '../db/connection.js';
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

  const validation = validateStripeCheckoutSession(result.order, session);
  if (!validation.ok) {
    return { ok: false, paymentStatus: existingStatus, error: validation.error };
  }

  if (existingStatus === 'paid') return { ok: true, paymentStatus: 'paid' };

  const newlyPaid = await markOrderPaid(orderId, { paidAmountOre: validation.paidAmountOre });
  if (newlyPaid) return { ok: true, paymentStatus: 'paid' };

  const refreshed = await getOrderById(orderId);
  if (String(refreshed?.order.payment_status ?? '') === 'paid') {
    return { ok: true, paymentStatus: 'paid' };
  }
  return { ok: false, paymentStatus: existingStatus, error: 'Payment amount was not accepted' };
}

export function validateStripeCheckoutSession(
  order: Row,
  session: Stripe.Checkout.Session
): { ok: true; paidAmountOre: number } | { ok: false; error: string } {
  const identity = validateStripeCheckoutSessionIdentity(order, session);
  if (!identity.ok) return identity;

  if (session.payment_status !== 'paid' || session.status !== 'complete') {
    return { ok: false, error: 'Payment not completed yet' };
  }
  return identity;
}

/**
 * Validate immutable checkout fields without assuming that payment succeeded.
 * Used both for fulfillment and for safe cleanup of terminal unpaid sessions.
 */
export function validateStripeCheckoutSessionIdentity(
  order: Row,
  session: Stripe.Checkout.Session
): { ok: true; paidAmountOre: number } | { ok: false; error: string } {
  const fields = validateStripeCheckoutSessionOrderFields(order, session);
  if (!fields.ok) return fields;

  const storedSessionId = String(order.stripe_checkout_session_id ?? '').trim();
  if (!storedSessionId || storedSessionId !== session.id) {
    return { ok: false, error: 'Session id does not match order' };
  }
  return fields;
}

/**
 * Validate the immutable order-bound fields shared by the original-session
 * and duplicate-session flows. Session ownership is intentionally checked by
 * each caller because those flows require opposite session-id relationships.
 */
export function validateStripeCheckoutSessionOrderFields(
  order: Row,
  session: Stripe.Checkout.Session
): { ok: true; paidAmountOre: number } | { ok: false; error: string } {
  const orderId = String(order.id ?? '').trim();
  if (!orderId || session.metadata?.orderId?.trim() !== orderId) {
    return { ok: false, error: 'Session does not match order' };
  }
  if (session.mode !== 'payment') {
    return { ok: false, error: 'Invalid checkout mode' };
  }
  if (String(session.currency ?? '').toLowerCase() !== 'sek') {
    return { ok: false, error: 'Invalid checkout currency' };
  }
  if (
    !Array.isArray(session.payment_method_types) ||
    session.payment_method_types.length !== 1 ||
    session.payment_method_types[0] !== 'card'
  ) {
    return { ok: false, error: 'Invalid checkout payment method' };
  }

  const paidAmountOre = session.amount_total;
  const expectedAmountOre = Number(order.total_ore ?? 0);
  if (!Number.isSafeInteger(paidAmountOre) || paidAmountOre !== expectedAmountOre || expectedAmountOre <= 0) {
    return { ok: false, error: 'Checkout amount does not match order' };
  }
  return { ok: true, paidAmountOre };
}
