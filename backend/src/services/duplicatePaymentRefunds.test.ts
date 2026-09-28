import assert from 'node:assert/strict';
import test from 'node:test';
import type Stripe from 'stripe';
import {
  expectedDuplicateRefundConfirmation,
  createDuplicateStripeRefund,
  validateDuplicateStripeRefundEvent,
  validateDuplicateStripePayment,
} from './duplicatePaymentRefunds.js';
import { RefundReconciliationRequiredError } from './refundProviders.js';
import { getStripe } from './stripeClient.js';

const orderId = '0aa461da-4f24-45ed-b1f2-79d6a7bb72d2';
const originalSessionId = 'cs_test_original_session';
const duplicateSessionId = 'cs_test_duplicate_session';
const order = {
  id: orderId,
  total_ore: 17_900,
  payment_status: 'paid',
  stripe_checkout_session_id: originalSessionId,
};

function duplicate(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: duplicateSessionId,
    object: 'checkout.session',
    metadata: { orderId },
    mode: 'payment',
    currency: 'sek',
    payment_status: 'paid',
    status: 'complete',
    payment_method_types: ['card'],
    amount_total: 17_900,
    payment_intent: 'pi_test_duplicate_payment',
    ...overrides,
  } as Stripe.Checkout.Session;
}

test('accepts a second paid Stripe session with exact order fields', () => {
  assert.deepEqual(validateDuplicateStripePayment(order, duplicate()), {
    ok: true,
    payment: {
      orderId,
      sessionId: duplicateSessionId,
      paymentIntentId: 'pi_test_duplicate_payment',
      amountOre: 17_900,
    },
  });
});

const rejected: Array<[string, typeof order, Partial<Stripe.Checkout.Session>]> = [
  ['unpaid order', { ...order, payment_status: 'pending' }, {}],
  ['missing original session', { ...order, stripe_checkout_session_id: '' }, {}],
  ['original session', order, { id: originalSessionId }],
  ['wrong metadata', order, { metadata: { orderId: 'another-order' } }],
  ['wrong amount', order, { amount_total: 1 }],
  ['wrong currency', order, { currency: 'eur' }],
  ['wrong mode', order, { mode: 'subscription' }],
  ['wrong method', order, { payment_method_types: ['klarna'] }],
  ['incomplete session', order, { status: 'open' }],
  ['unpaid session', order, { payment_status: 'unpaid' }],
  ['missing payment intent', order, { payment_intent: null }],
  ['malformed payment intent', order, { payment_intent: 'not-a-payment-intent' }],
];

for (const [name, candidateOrder, override] of rejected) {
  test(`rejects duplicate payment with ${name}`, () => {
    assert.equal(validateDuplicateStripePayment(candidateOrder, duplicate(override)).ok, false);
  });
}

test('binds the destructive confirmation phrase to the visible order number', () => {
  assert.equal(
    expectedDuplicateRefundConfirmation('#1042'),
    'ÅTERBETALA DUBBELBETALNING #1042'
  );
});

function refund(overrides: Partial<Stripe.Refund> = {}): Stripe.Refund {
  return {
    id: 're_test_duplicate_refund',
    object: 'refund',
    amount: 17_900,
    currency: 'sek',
    status: 'succeeded',
    payment_intent: 'pi_test_duplicate_payment',
    metadata: {
      duplicateRefundId: 'c5260eea-8f4f-4a12-a58f-79de348de289',
      duplicatePaymentEventId: 'evt_test_duplicate_payment',
      orderId,
    },
    ...overrides,
  } as Stripe.Refund;
}

const expectedRefund = {
  refundId: 'c5260eea-8f4f-4a12-a58f-79de348de289',
  eventId: 'evt_test_duplicate_payment',
  orderId,
  paymentIntentId: 'pi_test_duplicate_payment',
  amountOre: 17_900,
};

test('reconciles duplicate refunds after lost replies and refuses ambiguous new transfers', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_' + 'a'.repeat(32);
  const stripe = getStripe();
  const original = { list: stripe.refunds.list, create: stripe.refunds.create, retrieve: stripe.refunds.retrieve };
  const client = stripe as unknown as { refunds: {
    list: (params: { starting_after?: string }) => Promise<{ data: Stripe.Refund[]; has_more: boolean }>;
    create: (params: unknown, options: { idempotencyKey: string }) => Promise<Stripe.Refund>;
    retrieve: (id: string) => Promise<Stripe.Refund>;
  } };
  const input = { refundId: expectedRefund.refundId, eventId: expectedRefund.eventId,
    payment: { orderId, sessionId: duplicateSessionId, paymentIntentId: expectedRefund.paymentIntentId, amountOre: 17_900 },
    createdAt: new Date(Date.now() - 48 * 3600000).toISOString() };
  let creates = 0;
  try {
    client.refunds.create = async (_params, options) => {
      creates++;
      assert.equal(options.idempotencyKey, 'duplicate-payment-refund-' + input.refundId);
      return refund();
    };
    client.refunds.list = async () => ({ data: [refund()], has_more: false });
    assert.equal((await createDuplicateStripeRefund(input)).status, 'succeeded');
    client.refunds.list = async params => params.starting_after
      ? { data: [refund()], has_more: false }
      : { data: [refund({ id: 're_unrelated', metadata: {} })], has_more: true };
    assert.equal((await createDuplicateStripeRefund(input)).status, 'succeeded');
    for (const data of [[], [refund(), refund()], [refund({ amount: 1 })], [refund({ currency: 'eur' })],
      [refund({ payment_intent: 'pi_other' })], [refund({ metadata: { ...refund().metadata, duplicatePaymentEventId: 'evt_other' } })]]) {
      client.refunds.list = async () => ({ data, has_more: false });
      await assert.rejects(createDuplicateStripeRefund(input), RefundReconciliationRequiredError);
    }
    client.refunds.list = async () => ({ data: [refund()], has_more: true });
    await assert.rejects(createDuplicateStripeRefund(input), RefundReconciliationRequiredError);
    client.refunds.list = async () => { throw new Error('Synthetic pagination failure'); };
    await assert.rejects(createDuplicateStripeRefund(input));
    assert.equal(creates, 0);
    client.refunds.retrieve = async () => refund();
    assert.equal((await createDuplicateStripeRefund({ ...input, providerRefundId: refund().id })).status, 'succeeded');
    client.refunds.retrieve = async () => refund({ id: 're_wrong' });
    await assert.rejects(createDuplicateStripeRefund({ ...input, providerRefundId: refund().id }), RefundReconciliationRequiredError);
    client.refunds.list = async () => ({ data: [], has_more: false });
    assert.equal((await createDuplicateStripeRefund({ ...input, createdAt: new Date().toISOString() })).status, 'succeeded');
    assert.equal(creates, 1);
    client.refunds.create = async () => refund({ currency: 'eur' });
    await assert.rejects(createDuplicateStripeRefund({ ...input, createdAt: new Date().toISOString() }), RefundReconciliationRequiredError);
  } finally {
    Object.assign(stripe.refunds, original);
  }
});

test('accepts only an exact signed duplicate refund result', () => {
  assert.deepEqual(validateDuplicateStripeRefundEvent(refund(), expectedRefund), {
    ok: true,
    outcome: { providerRefundId: 're_test_duplicate_refund', status: 'succeeded' },
  });
});

for (const [name, override] of [
  ['metadata', { metadata: { ...refund().metadata, orderId: 'another-order' } }],
  ['amount', { amount: 1 }],
  ['currency', { currency: 'eur' }],
  ['payment intent', { payment_intent: 'pi_other_payment' }],
] as Array<[string, Partial<Stripe.Refund>]>) {
  test(`rejects a duplicate Stripe refund ${name} mismatch`, () => {
    assert.equal(validateDuplicateStripeRefundEvent(refund(override), expectedRefund).ok, false);
  });
}
