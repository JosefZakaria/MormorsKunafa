import assert from 'node:assert/strict';
import test from 'node:test';
import type Stripe from 'stripe';
import {
  validateStripeCheckoutSession,
  validateStripeCheckoutSessionIdentity,
  validateStripeCheckoutSessionOrderFields,
} from './confirmStripeCheckout.js';

const orderId = '0aa461da-4f24-45ed-b1f2-79d6a7bb72d2';
const sessionId = 'cs_test_authoritative';

const order = {
  id: orderId,
  total_ore: 17_900,
  stripe_checkout_session_id: sessionId,
};

function session(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: sessionId,
    object: 'checkout.session',
    metadata: { orderId },
    mode: 'payment',
    currency: 'sek',
    payment_status: 'paid',
    status: 'complete',
    payment_method_types: ['card'],
    amount_total: 17_900,
    ...overrides,
  } as Stripe.Checkout.Session;
}

test('accepts an exact Stripe Checkout match', () => {
  assert.deepEqual(validateStripeCheckoutSession(order, session()), {
    ok: true,
    paidAmountOre: 17_900,
  });
});

test('accepts immutable identity for an expired unpaid Stripe session without treating it as paid', () => {
  const expired = session({ status: 'expired', payment_status: 'unpaid' });
  assert.deepEqual(validateStripeCheckoutSessionIdentity(order, expired), {
    ok: true,
    paidAmountOre: 17_900,
  });
  assert.equal(validateStripeCheckoutSession(order, expired).ok, false);
});

test('validates common order fields independently of the session id', () => {
  assert.deepEqual(validateStripeCheckoutSessionOrderFields(order, session({ id: 'cs_test_second' })), {
    ok: true,
    paidAmountOre: 17_900,
  });
});

const mismatches: Array<[string, Partial<Stripe.Checkout.Session>]> = [
  ['metadata', { metadata: { orderId: 'another-order' } }],
  ['session id', { id: 'cs_test_other' }],
  ['amount', { amount_total: 1 }],
  ['currency', { currency: 'eur' }],
  ['mode', { mode: 'subscription' }],
  ['payment method', { payment_method_types: ['klarna'] }],
];

for (const [name, override] of mismatches) {
  test(`rejects a Stripe ${name} mismatch`, () => {
    assert.equal(validateStripeCheckoutSession(order, session(override)).ok, false);
  });
}

for (const [name, override] of mismatches) {
  test(`rejects a Stripe ${name} identity mismatch during reconciliation`, () => {
    assert.equal(validateStripeCheckoutSessionIdentity(order, session(override)).ok, false);
  });
}
