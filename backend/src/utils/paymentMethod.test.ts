import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublicPaymentMethodAvailable } from './paymentMethod.js';

test('allows public payment methods only when their provider is configured', () => {
  assert.equal(isPublicPaymentMethodAvailable('card', { stripe: true, swish: false }), true);
  assert.equal(isPublicPaymentMethodAvailable('card', { stripe: false, swish: true }), false);
  assert.equal(isPublicPaymentMethodAvailable('swish', { stripe: true, swish: true }), true);
  assert.equal(isPublicPaymentMethodAvailable('swish', { stripe: true, swish: false }), false);
  assert.equal(isPublicPaymentMethodAvailable('cash', { stripe: true, swish: true }), false);
});
