import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request } from 'express';
import { getTrustedClientIp, hashRateLimitIdentifier } from './rateLimit.js';

function request(headers: Record<string, string>, remoteAddress: string): Request {
  return { headers, socket: { remoteAddress } } as unknown as Request;
}

test('trusts only Vercel-overwritten client IP headers in Vercel', () => {
  process.env.VERCEL_ENV = 'production';
  assert.equal(
    getTrustedClientIp(request({ 'x-forwarded-for': '6.6.6.6', 'x-vercel-forwarded-for': '203.0.113.8' }, '127.0.0.1')),
    '203.0.113.8'
  );
  delete process.env.VERCEL_ENV;
  assert.equal(
    getTrustedClientIp(request({ 'x-forwarded-for': '6.6.6.6' }, '127.0.0.1')),
    '127.0.0.1'
  );
});

test('hashes contact identifiers before using them as Redis keys', () => {
  const hashed = hashRateLimitIdentifier(' Customer@Example.SE ');
  assert.equal(hashed, hashRateLimitIdentifier('customer@example.se'));
  assert.doesNotMatch(hashed, /customer/i);
});
