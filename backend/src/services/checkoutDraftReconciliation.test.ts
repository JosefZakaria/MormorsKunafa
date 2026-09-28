import assert from 'node:assert/strict';
import test from 'node:test';
import type Stripe from 'stripe';
import {
  reconcileInitiatedCheckoutDraft,
  type CheckoutDraftReconciliationDependencies,
} from './checkoutDraftReconciliation.js';
import type { InitiatedCheckoutDraft } from '../db/checkoutDraftRepository.js';
import type { SwishPaymentRequestResponse } from './swishClient.js';

const orderId = '0aa461da-4f24-45ed-b1f2-79d6a7bb72d2';
const before = '2026-08-18T00:00:00.000Z';
const stripeDraft: InitiatedCheckoutDraft = {
  orderId,
  paymentMethod: 'card',
  totalOre: 17_900,
  stripeCheckoutSessionId: 'cs_test_authoritative',
};
const swishDraft: InitiatedCheckoutDraft = {
  orderId,
  paymentMethod: 'swish',
  totalOre: 17_900,
  swishInstructionId: 'bd7204c1-3ec1-4b18-a52c-f6f8544f012f',
};

function stripeSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: stripeDraft.stripeCheckoutSessionId,
    object: 'checkout.session',
    metadata: { orderId },
    mode: 'payment',
    currency: 'sek',
    payment_status: 'unpaid',
    status: 'expired',
    payment_method_types: ['card'],
    amount_total: 17_900,
    ...overrides,
  } as Stripe.Checkout.Session;
}

function swishPayment(overrides: Partial<SwishPaymentRequestResponse> = {}): SwishPaymentRequestResponse {
  return {
    id: swishDraft.swishInstructionId ?? '',
    status: 'DECLINED',
    amount: '179.00',
    currency: 'SEK',
    payeeAlias: '1231181189',
    payeePaymentReference: orderId.slice(0, 35),
    ...overrides,
  };
}

function dependencies(overrides: Partial<CheckoutDraftReconciliationDependencies> = {}) {
  const calls = { marked: 0, deleted: 0 };
  const value: CheckoutDraftReconciliationDependencies = {
    retrieveStripeSession: async () => stripeSession(),
    retrieveSwishPayment: async () => swishPayment(),
    markPaid: async () => { calls.marked += 1; return true; },
    deleteDraft: async () => { calls.deleted += 1; return true; },
    swishPayeeAlias: '1231181189',
    ...overrides,
  };
  return { calls, value };
}

test('deletes only an exact expired and unpaid Stripe draft', async () => {
  const deps = dependencies();
  assert.equal(await reconcileInitiatedCheckoutDraft(stripeDraft, before, deps.value), 'deleted');
  assert.deepEqual(deps.calls, { marked: 0, deleted: 1 });
});

test('marks an exact paid Stripe draft instead of deleting it', async () => {
  const deps = dependencies({
    retrieveStripeSession: async () => stripeSession({ status: 'complete', payment_status: 'paid' }),
  });
  assert.equal(await reconcileInitiatedCheckoutDraft(stripeDraft, before, deps.value), 'paid');
  assert.deepEqual(deps.calls, { marked: 1, deleted: 0 });
});

test('retains open, mismatched and unknown Stripe states', async () => {
  for (const [session, outcome] of [
    [stripeSession({ status: 'open' }), 'pending'],
    [stripeSession({ amount_total: 1 }), 'rejected'],
    [stripeSession({ status: 'expired', payment_status: 'no_payment_required' }), 'rejected'],
  ] as const) {
    const deps = dependencies({ retrieveStripeSession: async () => session });
    assert.equal(await reconcileInitiatedCheckoutDraft(stripeDraft, before, deps.value), outcome);
    assert.deepEqual(deps.calls, { marked: 0, deleted: 0 });
  }
});

test('deletes an exact terminal unpaid Swish draft', async () => {
  for (const status of ['DECLINED', 'ERROR', 'CANCELLED']) {
    const deps = dependencies({ retrieveSwishPayment: async () => swishPayment({ status }) });
    assert.equal(await reconcileInitiatedCheckoutDraft(swishDraft, before, deps.value), 'deleted');
    assert.deepEqual(deps.calls, { marked: 0, deleted: 1 });
  }
});

test('marks paid Swish and retains created, mismatched and unknown states', async () => {
  const cases = [
    [swishPayment({ status: 'PAID' }), 'paid', 1],
    [swishPayment({ status: 'CREATED' }), 'pending', 0],
    [swishPayment({ amount: '0.01' }), 'rejected', 0],
    [swishPayment({ status: 'UNKNOWN' }), 'rejected', 0],
  ] as const;
  for (const [payment, outcome, marked] of cases) {
    const deps = dependencies({ retrieveSwishPayment: async () => payment });
    assert.equal(await reconcileInitiatedCheckoutDraft(swishDraft, before, deps.value), outcome);
    assert.deepEqual(deps.calls, { marked, deleted: 0 });
  }
});

test('keeps a terminal draft when the atomic delete no longer matches', async () => {
  const deps = dependencies({ deleteDraft: async () => false });
  assert.equal(await reconcileInitiatedCheckoutDraft(stripeDraft, before, deps.value), 'pending');
  assert.deepEqual(deps.calls, { marked: 0, deleted: 0 });
});
