import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyResendFailure } from './OrderConfirmationEmail.js';

test('Resend retries only failures protected by its stable idempotency key', () => {
  const transportFailure = classifyResendFailure(null);
  assert.equal(transportFailure.disposition, 'retryable');
  assert.equal(transportFailure.code, 'provider_network_error');
  assert.equal(classifyResendFailure(429).disposition, 'retryable');
  assert.equal(classifyResendFailure(503).disposition, 'retryable');
  assert.equal(classifyResendFailure(400).disposition, 'permanent');
});
