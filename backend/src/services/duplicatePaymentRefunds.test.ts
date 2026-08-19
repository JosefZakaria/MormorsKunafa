import assert from 'node:assert/strict';
import test from 'node:test';
import type Stripe from 'stripe';
import {
  expectedDuplicateRefundConfirmation,
  validateDuplicateStripePayment,
} from './duplicatePaymentRefunds.js';

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
