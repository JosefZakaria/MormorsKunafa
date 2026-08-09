import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { assertJwtConfiguration, signToken, verifyAdminToken } from './auth.js';

const secureTestSecret = 'test-only-jwt-secret-with-at-least-thirty-two-bytes';

test('signs and verifies only the configured admin token contract', () => {
  process.env.JWT_SECRET = secureTestSecret;
  assertJwtConfiguration();
  const payload = { adminId: 'admin-1', email: 'admin@example.test' };
  const token = signToken(payload);
  assert.deepEqual(verifyAdminToken(token), payload);
});

test('rejects a token without the required issuer and audience', () => {
  process.env.JWT_SECRET = secureTestSecret;
  const legacyToken = jwt.sign(
    { adminId: 'admin-1', email: 'admin@example.test' },
    secureTestSecret,
    { algorithm: 'HS256' }
  );
  assert.equal(verifyAdminToken(legacyToken), null);
});

test('refuses missing, short and formerly public fallback secrets', () => {
  for (const secret of ['', 'short', 'dev-secret-change-in-production']) {
    process.env.JWT_SECRET = secret;
    assert.throws(() => assertJwtConfiguration(), /at least 32 bytes/);
  }
});
