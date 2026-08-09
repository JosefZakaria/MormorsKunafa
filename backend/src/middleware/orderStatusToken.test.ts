import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrderStatusToken, verifyOrderStatusToken } from './orderStatusToken.js';

process.env.JWT_SECRET = 'test-only-order-status-secret-that-is-long-enough';

test('accepts a fresh token only for its order', () => {
  const orderId = 'ee8f1053-7e15-4675-8f80-f6cfa824ab8f';
  const token = createOrderStatusToken(orderId);
  assert.equal(verifyOrderStatusToken(orderId, token), true);
  assert.equal(verifyOrderStatusToken('f0233634-a75d-411f-b6d4-9379666a5cf8', token), false);
});

test('rejects a tampered token', () => {
  const orderId = 'ee8f1053-7e15-4675-8f80-f6cfa824ab8f';
  const token = createOrderStatusToken(orderId);
  const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
  assert.equal(verifyOrderStatusToken(orderId, tampered), false);
});
