import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPaymentSecurityAlertOutcome,
  PAYMENT_SECURITY_ALERT_OUTCOMES,
  parseStripeEventClaim,
} from './paymentEventRepository.js';

test('allows only persistent paid-session anomaly outcomes as admin alerts', () => {
  for (const outcome of PAYMENT_SECURITY_ALERT_OUTCOMES) {
    assert.equal(isPaymentSecurityAlertOutcome(outcome), true);
  }
  assert.equal(isPaymentSecurityAlertOutcome('order_already_paid'), false);
  assert.equal(isPaymentSecurityAlertOutcome('ignored_unpaid_session'), false);
  assert.equal(isPaymentSecurityAlertOutcome('alert_' + 'x'.repeat(1_000)), false);
});

test('requires an explicit event state and a fenced claim token', () => {
  for (const value of [true,false,null,{}, {status:'claimed'}, {status:'claimed',token:'stale'}, {status:'unknown'}]) {
    assert.throws(()=>parseStripeEventClaim(value));
  }
  for (const status of ['busy','processed']) assert.deepEqual(parseStripeEventClaim({status}),{status});
  const claim={status:'claimed',token:'f0233634-a75d-411f-b6d4-9379666a5cf8'};
  assert.deepEqual(parseStripeEventClaim(claim),claim);
});
