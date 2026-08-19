import type Stripe from 'stripe';
import { getStripe } from './stripeClient.js';
import {
  createSwishRefundRequest,
  getSwishPaymentRequest,
  getSwishRefund,
  parseSwishAmountToOre,
  parseSwishInstructionId,
  swishRefundIdFromUuid,
  verifySwishRefund,
  type SwishPaymentRequestResponse,
} from './swishClient.js';

export type ProviderRefundOutcome = {
  providerRefundId: string;
  status: 'pending' | 'succeeded' | 'failed';
  failureCode?: string;
};

export function validateStripeRefundSession(
  session: Stripe.Checkout.Session,
  expected: { orderId: string; sessionId: string; totalPaidOre: number }
): { ok: true; paymentIntentId: string } | { ok: false; reason: string } {
  if (session.id !== expected.sessionId || session.metadata?.orderId?.trim() !== expected.orderId) {
    return { ok: false, reason: 'Stripe session does not match order' };
  }
  if (session.mode !== 'payment' || session.status !== 'complete' || session.payment_status !== 'paid') {
    return { ok: false, reason: 'Stripe session is not a completed payment' };
  }
  if (String(session.currency ?? '').toLowerCase() !== 'sek' || session.amount_total !== expected.totalPaidOre) {
    return { ok: false, reason: 'Stripe original payment amount mismatch' };
  }
  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id;
  if (!paymentIntentId || !paymentIntentId.startsWith('pi_')) {
    return { ok: false, reason: 'Stripe payment intent is missing' };
  }
  return { ok: true, paymentIntentId };
}

export function stripeRefundOutcome(refund: Stripe.Refund): ProviderRefundOutcome {
  const status = String(refund.status ?? '').toLowerCase();
  if (status === 'succeeded') return { providerRefundId: refund.id, status: 'succeeded' };
  if (status === 'failed' || status === 'canceled') {
    return {
      providerRefundId: refund.id,
      status: 'failed',
      failureCode: String(refund.failure_reason ?? status).slice(0, 100),
    };
  }
  if (status === 'pending' || status === 'requires_action') {
    return { providerRefundId: refund.id, status: 'pending' };
  }
  throw new Error('Stripe returned an unexpected refund status');
}

export function validateStripeRefundEvent(
  refund: Stripe.Refund,
  expected: {
    refundId: string;
    orderId: string;
    amountOre: number;
    paymentIntentId: string;
    providerRefundId?: string;
  }
): { ok: true; outcome: ProviderRefundOutcome } | { ok: false; reason: string } {
  if (refund.metadata?.refundId !== expected.refundId || refund.metadata?.orderId !== expected.orderId) {
    return { ok: false, reason: 'Stripe refund metadata mismatch' };
  }
  if (expected.providerRefundId && refund.id !== expected.providerRefundId) {
    return { ok: false, reason: 'Stripe refund ID mismatch' };
  }
  if (refund.amount !== expected.amountOre || String(refund.currency).toLowerCase() !== 'sek') {
    return { ok: false, reason: 'Stripe refund amount mismatch' };
  }
  const paymentIntentId = typeof refund.payment_intent === 'string'
    ? refund.payment_intent
    : refund.payment_intent?.id;
  if (paymentIntentId !== expected.paymentIntentId) {
    return { ok: false, reason: 'Stripe refund payment intent mismatch' };
  }
  try {
    return { ok: true, outcome: stripeRefundOutcome(refund) };
  } catch {
    return { ok: false, reason: 'Unexpected Stripe refund status' };
  }
}

export async function createStripeOrderRefund(input: {
  refundId: string;
  orderId: string;
  sessionId: string;
  totalPaidOre: number;
  amountOre: number;
}): Promise<ProviderRefundOutcome> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(input.sessionId);
  const validation = validateStripeRefundSession(session, {
    orderId: input.orderId,
    sessionId: input.sessionId,
    totalPaidOre: input.totalPaidOre,
  });
  if (!validation.ok) throw new Error(validation.reason);
  const refund = await stripe.refunds.create({
    payment_intent: validation.paymentIntentId,
    amount: input.amountOre,
    reason: 'requested_by_customer',
    metadata: { orderId: input.orderId, refundId: input.refundId },
  }, { idempotencyKey: `order-refund-${input.refundId}` });
  return stripeRefundOutcome(refund);
}

export async function getStripeRefundOutcome(providerRefundId: string): Promise<ProviderRefundOutcome> {
  return stripeRefundOutcome(await getStripe().refunds.retrieve(providerRefundId));
}

export function validateOriginalSwishPayment(
  payment: SwishPaymentRequestResponse,
  expected: {
    instructionId: string;
    orderId: string;
    totalPaidOre: number;
    merchantAlias: string;
  }
): { ok: true; originalPaymentReference: string } | { ok: false; reason: string } {
  if (parseSwishInstructionId(payment.id) !== expected.instructionId) {
    return { ok: false, reason: 'Swish instruction ID mismatch' };
  }
  if (String(payment.status ?? '').toUpperCase() !== 'PAID') {
    return { ok: false, reason: 'Original Swish payment is not paid' };
  }
  if (payment.amount == null || parseSwishAmountToOre(payment.amount) !== expected.totalPaidOre) {
    return { ok: false, reason: 'Original Swish amount mismatch' };
  }
  if (String(payment.currency ?? '').toUpperCase() !== 'SEK') {
    return { ok: false, reason: 'Original Swish currency mismatch' };
  }
  if (String(payment.payeeAlias ?? '').trim() !== expected.merchantAlias) {
    return { ok: false, reason: 'Original Swish merchant mismatch' };
  }
  if (String(payment.payeePaymentReference ?? '').trim() !== expected.orderId.slice(0, 35)) {
    return { ok: false, reason: 'Original Swish order reference mismatch' };
  }
  const originalPaymentReference = String(payment.paymentReference ?? '').trim().toUpperCase();
  if (!/^[0-9A-F]{32}$/.test(originalPaymentReference)) {
    return { ok: false, reason: 'Original Swish payment reference is missing' };
  }
  return { ok: true, originalPaymentReference };
}

export async function createSwishOrderRefund(input: {
  refundId: string;
  orderId: string;
  orderNumber: string;
  instructionId: string;
  totalPaidOre: number;
  amountOre: number;
}): Promise<ProviderRefundOutcome> {
  const instructionId = parseSwishInstructionId(input.instructionId);
  const merchantAlias = process.env.SWISH_PAYEE_ALIAS?.trim() ?? '';
  if (!instructionId || !merchantAlias) throw new Error('Swish refund configuration is invalid');
  const original = await getSwishPaymentRequest(instructionId);
  const validation = validateOriginalSwishPayment(original, {
    instructionId,
    orderId: input.orderId,
    totalPaidOre: input.totalPaidOre,
    merchantAlias,
  });
  if (!validation.ok) throw new Error(validation.reason);
  const providerRefundId = swishRefundIdFromUuid(input.refundId);
  await createSwishRefundRequest({
    refundId: providerRefundId,
    originalPaymentReference: validation.originalPaymentReference,
    amountOre: input.amountOre,
    payerPaymentReference: input.refundId.replaceAll('-', ''),
    orderNumber: input.orderNumber,
  });
  return { providerRefundId, status: 'pending' };
}

export async function getSwishRefundOutcome(input: {
  providerRefundId: string;
  originalPaymentReference: string;
  amountOre: number;
}): Promise<ProviderRefundOutcome> {
  const payerAlias = process.env.SWISH_PAYEE_ALIAS?.trim() ?? '';
  const result = verifySwishRefund(await getSwishRefund(input.providerRefundId), {
    refundId: input.providerRefundId,
    originalPaymentReference: input.originalPaymentReference,
    amountOre: input.amountOre,
    payerAlias,
  });
  if (!result.ok) throw new Error(result.reason);
  return {
    providerRefundId: input.providerRefundId,
    status: result.status,
    failureCode: result.failureCode,
  };
}
