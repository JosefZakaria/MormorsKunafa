import type Stripe from 'stripe';
import type { Row } from '../db/connection.js';
import { validateStripeCheckoutSessionOrderFields } from '../utils/confirmStripeCheckout.js';

export type VerifiedDuplicateStripePayment = {
  orderId: string;
  sessionId: string;
  paymentIntentId: string;
  amountOre: number;
};

/**
 * A duplicate payment is refundable only when it is a second, fully paid
 * Checkout Session for an order that the database already considers paid.
 * Mismatched alerts stay investigation-only.
 */
export function validateDuplicateStripePayment(
  order: Row,
  session: Stripe.Checkout.Session
): { ok: true; payment: VerifiedDuplicateStripePayment } | { ok: false; reason: string } {
  if (String(order.payment_status ?? '') !== 'paid') {
    return { ok: false, reason: 'Order is not already paid' };
  }

  const fields = validateStripeCheckoutSessionOrderFields(order, session);
  if (!fields.ok) return { ok: false, reason: fields.error };

  const originalSessionId = String(order.stripe_checkout_session_id ?? '').trim();
  if (!originalSessionId) {
    return { ok: false, reason: 'Order is missing its original Stripe session' };
  }
  if (session.id === originalSessionId) {
    return { ok: false, reason: 'Alert references the original Stripe session' };
  }
  if (session.status !== 'complete' || session.payment_status !== 'paid') {
    return { ok: false, reason: 'Duplicate Stripe session is not fully paid' };
  }

  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent.trim()
    : session.payment_intent?.id?.trim();
  if (!paymentIntentId || !/^pi_[A-Za-z0-9_]{8,255}$/.test(paymentIntentId)) {
    return { ok: false, reason: 'Duplicate Stripe session is missing its payment intent' };
  }

  return {
    ok: true,
    payment: {
      orderId: String(order.id),
      sessionId: session.id,
      paymentIntentId,
      amountOre: fields.paidAmountOre,
    },
  };
}
