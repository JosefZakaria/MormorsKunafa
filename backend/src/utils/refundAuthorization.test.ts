import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import {
  isRefundPasswordConfigured,
  verifyRefundPassword,
} from './refundAuthorization.js';

test('accepts a sufficiently costly bcrypt refund-password hash', async () => {
  const hash = await bcrypt.hash('test-only refund password', 10);
  assert.equal(isRefundPasswordConfigured(hash), true);
  assert.equal(await verifyRefundPassword('test-only refund password', hash), true);
  assert.equal(await verifyRefundPassword('wrong password', hash), false);
});

test('fails closed for missing, malformed and cheap refund hashes', async () => {
  const cheapHash = await bcrypt.hash('test-only refund password', 4);
  assert.equal(isRefundPasswordConfigured(undefined), false);
  assert.equal(isRefundPasswordConfigured('plain text is forbidden'), false);
  assert.equal(isRefundPasswordConfigured(cheapHash), false);
  assert.equal(await verifyRefundPassword('anything', undefined), false);
  assert.equal(await verifyRefundPassword('anything', 'not-a-hash'), false);
});
