import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import {
  assertOrderStatusTokenConfiguration,
  createOrderStatusToken,
  verifyOrderStatusToken,
  verifyStoredOrderStatusToken,
} from './orderStatusToken.js';

process.env.JWT_SECRET = 'test-only-order-status-secret-that-is-long-enough';
delete process.env.ORDER_STATUS_TOKEN_SECRET;
delete process.env.VERCEL_ENV;

const independentSecret = 'synthetic-independent-status-v2-key-at-least-thirty-two-bytes';
const compatibleOrderId = 'ee8f1053-7e15-4675-8f80-f6cfa824ab8f';

function withEnvironment(values: Record<string, string | undefined>, action: () => void): void {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    action();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('activating the separate status key preserves stored legacy tokens and issues only v2', () => {
  const legacy = createOrderStatusToken(compatibleOrderId);
  assert.match(legacy.token, /^v1\./);
  withEnvironment({ ORDER_STATUS_TOKEN_SECRET: independentSecret, VERCEL_ENV: 'preview' }, () => {
    assert.equal(verifyStoredOrderStatusToken(compatibleOrderId, legacy.token, legacy.tokenHash, legacy.expiresAt), true);
    assert.equal(verifyStoredOrderStatusToken(compatibleOrderId, legacy.token, null, legacy.expiresAt), false);
    assert.equal(verifyStoredOrderStatusToken(compatibleOrderId, legacy.token, legacy.tokenHash, null), false);
    assert.equal(verifyStoredOrderStatusToken(compatibleOrderId, legacy.token, legacy.tokenHash, legacy.expiresAt, Date.now() + 8 * 86400000), false);
    const current = createOrderStatusToken(compatibleOrderId);
    assert.match(current.token, /^v2\./);
    assert.equal(verifyStoredOrderStatusToken(compatibleOrderId, current.token, current.tokenHash, current.expiresAt), true);
    withEnvironment({ JWT_SECRET: 'another-synthetic-jwt-key-with-at-least-thirty-two-bytes' }, () => {
      assert.equal(verifyOrderStatusToken(compatibleOrderId, current.token), true);
      assert.equal(verifyOrderStatusToken(compatibleOrderId, legacy.token), false);
    });
  });
});

test('v2 never falls back to JWT when its dedicated key is wrong, missing or reused', () => {
  withEnvironment({ ORDER_STATUS_TOKEN_SECRET: independentSecret }, () => {
    const current = createOrderStatusToken(compatibleOrderId);
    for (const secret of [undefined, 'different-synthetic-status-key-with-thirty-two-bytes', process.env.JWT_SECRET]) {
      withEnvironment({ ORDER_STATUS_TOKEN_SECRET: secret }, () => {
        assert.equal(verifyStoredOrderStatusToken(compatibleOrderId, current.token, current.tokenHash, current.expiresAt), false);
      });
    }
    const [, expires, nonce] = current.token.split('.');
    const forgedSignature = createHmac('sha256', process.env.JWT_SECRET!)
      .update(`order-status-v2\0${compatibleOrderId}\0${expires}\0${nonce}`).digest('base64url');
    assert.equal(verifyOrderStatusToken(compatibleOrderId, `v2.${expires}.${nonce}.${forgedSignature}`), false);
  });
});

test('v2 rejects a relabeled version, changed order, expiry, nonce or signature', () => {
  withEnvironment({ ORDER_STATUS_TOKEN_SECRET: independentSecret }, () => {
    const { token } = createOrderStatusToken(compatibleOrderId);
    assert.equal(verifyOrderStatusToken('f0233634-a75d-411f-b6d4-9379666a5cf8', token), false);
    const parts = token.split('.');
    for (const version of ['v1', 'v3']) {
      assert.equal(verifyOrderStatusToken(compatibleOrderId, [version, ...parts.slice(1)].join('.')), false);
    }
    for (const [index, value] of [[1, String(Number(parts[1]) + 1)], [2, 'A'.repeat(22)], [3, 'A'.repeat(43)]] as const) {
      const changed = [...parts];
      changed[index] = value;
      assert.equal(verifyOrderStatusToken(compatibleOrderId, changed.join('.')), false);
    }
  });
});

test('Preview requires a strong separate key and invalid configured keys never silently issue v1', () => {
  withEnvironment({ VERCEL_ENV: 'preview', ORDER_STATUS_TOKEN_SECRET: undefined }, () => {
    assert.throws(assertOrderStatusTokenConfiguration, /Preview requires/);
    assert.throws(() => createOrderStatusToken(compatibleOrderId), /Preview requires/);
  });
  for (const secret of ['short', process.env.JWT_SECRET]) {
    withEnvironment({ ORDER_STATUS_TOKEN_SECRET: secret }, () => {
      assert.throws(assertOrderStatusTokenConfiguration, /at least 32 bytes and differ/);
      assert.throws(() => createOrderStatusToken(compatibleOrderId), /at least 32 bytes and differ/);
    });
  }
  withEnvironment({ VERCEL_ENV: 'preview', ORDER_STATUS_TOKEN_SECRET: independentSecret }, () => {
    assert.doesNotThrow(assertOrderStatusTokenConfiguration);
  });
});

test('preorder status remains accessible through the booking and remains bounded', () => {
  const now=Date.now(), day=86400000, id='ee8f1053-7e15-4675-8f80-f6cfa824ab8f';
  const scheduled=new Date(now+30*day);
  const {token,tokenHash,expiresAt}=createOrderStatusToken(id,now,scheduled);
  assert.equal(verifyStoredOrderStatusToken(id,token,tokenHash,expiresAt,now+31*day),true);
  assert.equal(verifyStoredOrderStatusToken(id,token,tokenHash,expiresAt,now+38*day),false);
  assert.throws(()=>createOrderStatusToken(id,now,new Date(now+32*day)));
  assert.throws(()=>createOrderStatusToken(id,now,new Date('invalid')));
});

test('accepts a fresh token only for its order', () => {
  const orderId = 'ee8f1053-7e15-4675-8f80-f6cfa824ab8f';
  const { token, tokenHash, expiresAt } = createOrderStatusToken(orderId);
  assert.equal(verifyOrderStatusToken(orderId, token), true);
  assert.equal(verifyOrderStatusToken('f0233634-a75d-411f-b6d4-9379666a5cf8', token), false);
  assert.equal(verifyStoredOrderStatusToken(orderId, token, tokenHash, expiresAt), true);
  assert.equal(verifyStoredOrderStatusToken(orderId, token, null, expiresAt), false);
});

test('rejects a tampered token', () => {
  const orderId = 'ee8f1053-7e15-4675-8f80-f6cfa824ab8f';
  const { token } = createOrderStatusToken(orderId);
  const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
  assert.equal(verifyOrderStatusToken(orderId, tampered), false);
});

test('rejects an expired or individually revoked stored token', () => {
  const orderId = 'ee8f1053-7e15-4675-8f80-f6cfa824ab8f';
  const now = Date.now();
  const { token, tokenHash, expiresAt } = createOrderStatusToken(orderId, now);
  assert.equal(verifyStoredOrderStatusToken(orderId, token, tokenHash, expiresAt, now), true);
  assert.equal(verifyStoredOrderStatusToken(orderId, token, tokenHash, expiresAt, now + 8 * 24 * 60 * 60 * 1000), false);
  assert.equal(verifyStoredOrderStatusToken(orderId, token, 'A'.repeat(43), expiresAt, now), false);
});
