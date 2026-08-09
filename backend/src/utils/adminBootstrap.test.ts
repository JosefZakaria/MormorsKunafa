import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertAdminBootstrapIsLocal,
  readAdminBootstrapCredentials,
} from './adminBootstrap.js';

test('blocks admin bootstrap in production and every Vercel environment', () => {
  assert.throws(() => assertAdminBootstrapIsLocal('production', undefined));
  assert.throws(() => assertAdminBootstrapIsLocal('development', 'preview'));
  assert.doesNotThrow(() => assertAdminBootstrapIsLocal('development', undefined));
});

test('requires explicit strong bootstrap credentials', () => {
  assert.throws(() => readAdminBootstrapCredentials({}));
  assert.throws(() => readAdminBootstrapCredentials({
    DEFAULT_ADMIN_EMAIL: 'admin@example.com',
    DEFAULT_ADMIN_PASSWORD: 'admin123',
  }));
  assert.deepEqual(readAdminBootstrapCredentials({
    DEFAULT_ADMIN_EMAIL: 'admin@example.com',
    DEFAULT_ADMIN_PASSWORD: 'a-long-local-password',
  }), {
    email: 'admin@example.com',
    password: 'a-long-local-password',
  });
});
