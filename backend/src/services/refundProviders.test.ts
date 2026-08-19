import assert from 'node:assert/strict';
import test from 'node:test';
import type Stripe from 'stripe';
import {
  validateOriginalSwishPayment,
  validateStripeRefundSession,
} from './refundProviders.js';

const orderId = '123e4567-e89b-42d3-a456-426614174000';

function stripeSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_test_expected',
    object: 'checkout.session',
    metadata: { orderId },
    mode: 'payment',
    status: 'complete',
    payment_status: 'paid',
    currency: 'sek',
    amount_total: 17_900,
    payment_intent: 'pi_expected',
    ...overrides,
  } as Stripe.Checkout.Session;
}

test('accepts only the exact original Stripe payment before refunding', () => {
  assert.deepEqual(validateStripeRefundSession(stripeSession(), {
    orderId,
    sessionId: 'cs_test_expected',
    totalPaidOre: 17_900,
  }), { ok: true, paymentIntentId: 'pi_expected' });
});

test('rejects mismatched Stripe refund sources', () => {
  const expected = { orderId, sessionId: 'cs_test_expected', totalPaidOre: 17_900 };
  assert.equal(validateStripeRefundSession(stripeSession({ amount_total: 1 }), expected).ok, false);
  assert.equal(validateStripeRefundSession(stripeSession({ currency: 'eur' }), expected).ok, false);
  assert.equal(validateStripeRefundSession(stripeSession({ metadata: { orderId: 'another' } }), expected).ok, false);
  assert.equal(validateStripeRefundSession(stripeSession({ payment_intent: null }), expected).ok, false);
});

test('accepts only an exact paid Swish source with a bank payment reference', () => {
  const instructionId = 'bd7204c1-3ec1-4b18-a52c-f6f8544f012f';
  const result = validateOriginalSwishPayment({
    id: instructionId,
    status: 'PAID',
    amount: '179.00',
    currency: 'SEK',
    payeeAlias: '1231181189',
    payeePaymentReference: orderId.slice(0, 35),
    paymentReference: '6D6CD7406ECE4542A80152D909EF9F6B',
  }, { instructionId, orderId, totalPaidOre: 17_900, merchantAlias: '1231181189' });
  assert.deepEqual(result, {
    ok: true,
    originalPaymentReference: '6D6CD7406ECE4542A80152D909EF9F6B',
  });
});

test('rejects Swish sources with altered amount, order or payment reference', () => {
  const instructionId = 'bd7204c1-3ec1-4b18-a52c-f6f8544f012f';
  const base = {
    id: instructionId,
    status: 'PAID',
    amount: '179.00',
    currency: 'SEK',
    payeeAlias: '1231181189',
    payeePaymentReference: orderId.slice(0, 35),
    paymentReference: '6D6CD7406ECE4542A80152D909EF9F6B',
  };
  const expected = { instructionId, orderId, totalPaidOre: 17_900, merchantAlias: '1231181189' };
  assert.equal(validateOriginalSwishPayment({ ...base, amount: '0.01' }, expected).ok, false);
  assert.equal(validateOriginalSwishPayment({ ...base, payeePaymentReference: 'another' }, expected).ok, false);
  assert.equal(validateOriginalSwishPayment({ ...base, paymentReference: 'missing' }, expected).ok, false);
});
