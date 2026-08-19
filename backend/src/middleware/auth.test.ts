import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import {
  assertJwtConfiguration,
  createAdminSessionCookies,
  signToken,
  verifyAdminToken,
  verifyCsrfTokens,
} from './auth.js';

const secureTestSecret = 'test-only-jwt-secret-with-at-least-thirty-two-bytes';

test('signs and verifies only the configured admin token contract', () => {
  process.env.JWT_SECRET = secureTestSecret;
  assertJwtConfiguration();
  const payload = { adminId: 'admin-1', email: 'admin@example.test', tokenVersion: 3 };
  const token = signToken(payload);
  assert.deepEqual(verifyAdminToken(token), payload);
});

test('rejects legacy tokens without a database session version', () => {
  process.env.JWT_SECRET = secureTestSecret;
  const legacyToken = jwt.sign(
    { adminId: 'admin-1', email: 'admin@example.test' },
    secureTestSecret,
    {
      algorithm: 'HS256',
      issuer: 'mormors-kunafa-backend',
      audience: 'mormors-kunafa-admin',
    }
  );
  assert.equal(verifyAdminToken(legacyToken), null);
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

test('creates HttpOnly Strict session cookies and validates double-submit CSRF', () => {
  process.env.NODE_ENV = 'production';
  const cookies = createAdminSessionCookies('signed-token', 'csrf-token');
  assert.match(cookies[0], /HttpOnly/);
  assert.match(cookies[0], /SameSite=Strict/);
  assert.match(cookies[0], /Secure/);
  assert.doesNotMatch(cookies[1], /HttpOnly/);
  assert.equal(verifyCsrfTokens('csrf-token', 'csrf-token'), true);
  assert.equal(verifyCsrfTokens('csrf-token', 'tampered'), false);
});
