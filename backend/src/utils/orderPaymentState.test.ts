import assert from 'node:assert/strict';
import test from 'node:test';
import { canCancelOrderPayment, canStartOrderPayment } from './orderPaymentState.js';

test('only a new pending order can start or reuse payment', () => {
  assert.equal(canStartOrderPayment({ status: 'ny', payment_status: 'pending' }), true);
  for (const status of ['mottagen', 'påbörjad', 'klar', 'avbruten', 'uthämtad', 'levererad', undefined]) {
    assert.equal(canStartOrderPayment({ status, payment_status: 'pending' }), false);
  }
  assert.equal(canStartOrderPayment({ status: 'ny', payment_status: 'paid' }), false);
});

test('online cancellation requires a confirmed full refund, including legacy app payments', () => {
  for (const payment_method of ['card', 'app', 'swish']) {
    for (const payment_status of ['pending', 'paid']) {
      for (const refund_status of ['none', 'pending', 'partially_refunded', 'failed', 'refunded', null]) {
        assert.equal(canCancelOrderPayment({ payment_method, payment_status, refund_status }),
          payment_status === 'paid' && refund_status === 'refunded');
      }
    }
  }
  assert.equal(canCancelOrderPayment({ payment_method: 'cash', payment_status: 'pending' }), true);
});
