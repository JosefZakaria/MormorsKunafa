import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPaymentSecurityAlertOutcome,
  PAYMENT_SECURITY_ALERT_OUTCOMES,
} from './paymentEventRepository.js';

test('allows only persistent paid-session anomaly outcomes as admin alerts', () => {
  for (const outcome of PAYMENT_SECURITY_ALERT_OUTCOMES) {
    assert.equal(isPaymentSecurityAlertOutcome(outcome), true);
  }
  assert.equal(isPaymentSecurityAlertOutcome('order_already_paid'), false);
  assert.equal(isPaymentSecurityAlertOutcome('ignored_unpaid_session'), false);
  assert.equal(isPaymentSecurityAlertOutcome('alert_' + 'x'.repeat(1_000)), false);
});
