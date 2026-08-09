import assert from 'node:assert/strict';
import test from 'node:test';
import type Stripe from 'stripe';
import { validateStripeCheckoutSession } from './confirmStripeCheckout.js';

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
