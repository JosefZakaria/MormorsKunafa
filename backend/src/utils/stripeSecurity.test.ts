import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertStripeServerKey,
  assertStripeWebhookSecret,
  isExpectedStripeEventMode,
  safeStripeVerificationError,
} from './stripeSecurity.js';

test('accepts server keys but requires live mode in production', () => {
  assert.doesNotThrow(() => assertStripeServerKey('sk_test_1234567890', 'development'));
  assert.doesNotThrow(() => assertStripeServerKey('rk_live_1234567890', 'production'));
  assert.throws(() => assertStripeServerKey('pk_live_1234567890', 'production'));
  assert.throws(() => assertStripeServerKey('sk_test_1234567890', 'production'));
  assert.throws(() => assertStripeServerKey('sk_live_bad key', 'production'));
});

test('validates webhook secret shape and event deployment mode', () => {
  assert.doesNotThrow(() => assertStripeWebhookSecret('whsec_1234567890123456'));
  assert.throws(() => assertStripeWebhookSecret('secret'));
  assert.equal(isExpectedStripeEventMode(true, 'production'), true);
  assert.equal(isExpectedStripeEventMode(false, 'production'), false);
  assert.equal(isExpectedStripeEventMode(false, 'production', 'preview'), true);
});

test('never returns provider error messages for signature failures', () => {
  assert.equal(safeStripeVerificationError(new TypeError('raw signing secret leaked')), 'TypeError');
  assert.equal(safeStripeVerificationError({ message: 'raw signing secret leaked' }), 'StripeVerificationError');
});
