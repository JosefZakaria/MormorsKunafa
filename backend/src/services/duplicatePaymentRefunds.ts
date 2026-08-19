import type Stripe from 'stripe';
import type { Row } from '../db/connection.js';
import { getOrderById } from '../db/orderRepository.js';
import { validateStripeCheckoutSessionOrderFields } from '../utils/confirmStripeCheckout.js';
import { isExpectedStripeEventMode } from '../utils/stripeSecurity.js';
import { getStripe } from './stripeClient.js';
import { stripeRefundOutcome, type ProviderRefundOutcome } from './refundProviders.js';

export type VerifiedDuplicateStripePayment = {
  orderId: string;
  sessionId: string;
  paymentIntentId: string;
  amountOre: number;
};

export type DuplicateStripePaymentContext = {
  payment: VerifiedDuplicateStripePayment;
  orderNumber: string;
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

export async function getDuplicateStripePaymentContext(
  eventId: string
): Promise<DuplicateStripePaymentContext> {
  if (!/^evt_[A-Za-z0-9_]{8,255}$/.test(eventId)) {
    throw new Error('Invalid Stripe event identifier');
  }
  const stripe = getStripe();
  const event = await stripe.events.retrieve(eventId);
  if (
    event.id !== eventId
    || event.type !== 'checkout.session.completed'
    || !isExpectedStripeEventMode(event.livemode)
    || event.data.object.object !== 'checkout.session'
  ) {
    throw new Error('Stripe event is not an eligible checkout completion');
  }
  const eventSession = event.data.object as Stripe.Checkout.Session;
  const session = await stripe.checkout.sessions.retrieve(eventSession.id);
  if (session.id !== eventSession.id) throw new Error('Stripe returned another Checkout Session');
  const orderId = session.metadata?.orderId?.trim() ?? '';
  const order = orderId ? await getOrderById(orderId) : null;
  if (!order) throw new Error('Duplicate payment order does not exist');
  const verified = validateDuplicateStripePayment(order.order, session);
  if (!verified.ok) throw new Error(verified.reason);
  const orderNumber = String(order.order.order_number ?? '').trim();
  if (!orderNumber) throw new Error('Duplicate payment order number is missing');
  return { payment: verified.payment, orderNumber };
}

export async function createDuplicateStripeRefund(input: {
  refundId: string;
  eventId: string;
  payment: VerifiedDuplicateStripePayment;
}): Promise<ProviderRefundOutcome> {
  const refund = await getStripe().refunds.create({
    payment_intent: input.payment.paymentIntentId,
    amount: input.payment.amountOre,
    reason: 'duplicate',
    metadata: {
      orderId: input.payment.orderId,
      duplicateRefundId: input.refundId,
      duplicatePaymentEventId: input.eventId,
    },
  }, { idempotencyKey: `duplicate-payment-refund-${input.refundId}` });
  return stripeRefundOutcome(refund);
}

export function validateDuplicateStripeRefundEvent(
  refund: Stripe.Refund,
  expected: {
    refundId: string;
    eventId: string;
    orderId: string;
    paymentIntentId: string;
    amountOre: number;
    providerRefundId?: string;
  }
): { ok: true; outcome: ProviderRefundOutcome } | { ok: false; reason: string } {
  if (
    refund.metadata?.duplicateRefundId !== expected.refundId
    || refund.metadata?.duplicatePaymentEventId !== expected.eventId
    || refund.metadata?.orderId !== expected.orderId
  ) {
    return { ok: false, reason: 'Duplicate refund metadata mismatch' };
  }
  if (expected.providerRefundId && refund.id !== expected.providerRefundId) {
    return { ok: false, reason: 'Duplicate refund ID mismatch' };
  }
  if (refund.amount !== expected.amountOre || String(refund.currency).toLowerCase() !== 'sek') {
    return { ok: false, reason: 'Duplicate refund amount mismatch' };
  }
  const paymentIntentId = typeof refund.payment_intent === 'string'
    ? refund.payment_intent
    : refund.payment_intent?.id;
  if (paymentIntentId !== expected.paymentIntentId) {
    return { ok: false, reason: 'Duplicate refund payment intent mismatch' };
  }
  try {
    return { ok: true, outcome: stripeRefundOutcome(refund) };
  } catch {
    return { ok: false, reason: 'Unexpected duplicate refund status' };
  }
}

export function expectedDuplicateRefundConfirmation(orderNumber: string): string {
  return `ÅTERBETALA DUBBELBETALNING ${orderNumber}`;
}
