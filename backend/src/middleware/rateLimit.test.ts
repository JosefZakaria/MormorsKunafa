import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';
import { createRateLimiter, getTrustedClientIp, getClientIpRateLimitIdentifier, hashRateLimitIdentifier } from './rateLimit.js';

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

test('default IP rate-limit identifiers contain only a stable hash', () => {
  const previous = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = 'preview';
    const ip = '203.0.113.8';
    const hashed = getClientIpRateLimitIdentifier(request({ 'x-vercel-forwarded-for': ip }, '127.0.0.1'));
    assert.equal(hashed, hashRateLimitIdentifier(ip));
    assert.match(hashed, /^[A-Za-z0-9_-]{43}$/);
    assert(!hashed.includes(ip));
    assert.equal(getClientIpRateLimitIdentifier(request({ 'x-vercel-forwarded-for': ip }, '127.0.0.2')), hashed);
    assert.notEqual(getClientIpRateLimitIdentifier(request({ 'x-vercel-forwarded-for': '203.0.113.9' }, '127.0.0.1')), hashed);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});

test('two distributed middleware instances send hashed IP keys to the Redis transport', async () => {
  const keys = ['VERCEL_ENV', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const sentBodies: string[] = [];
  const ip = '203.0.113.18';
  try {
    Object.assign(process.env, {
      VERCEL_ENV: 'preview',
      UPSTASH_REDIS_REST_URL: 'https://rate-limit.example.test',
      UPSTASH_REDIS_REST_TOKEN: 'synthetic-test-token',
    });
    globalThis.fetch = async (input, init) => {
      const outgoing = new Request(input, init);
      const url = new URL(outgoing.url);
      assert.equal(url.origin, 'https://rate-limit.example.test', 'No external Redis requests are allowed');
      const body = await outgoing.text();
      sentBodies.push(body);
      const result = url.pathname.endsWith('/pipeline')
        ? JSON.parse(body).map(() => ({ result: 1 }))
        : { result: 1 };
      return globalThis.Response.json(result);
    };
    const response = { setHeader() {}, status() { throw new Error('Synthetic Redis request should be accepted'); } } as unknown as Response;
    let accepted = 0;
    for (let instance = 0; instance < 2; instance++) {
      const limiter = createRateLimiter({ windowMs: 60_000, max: 10, prefix: 'synthetic-ip-privacy' });
      await limiter(request({ 'x-vercel-forwarded-for': ip }, '127.0.0.1'), response, () => { accepted++; });
    }
    assert.equal(accepted, 2);
    assert.equal(sentBodies.length, 2);
    for (const body of sentBodies) {
      assert(!body.includes(ip), 'The Redis transport must never receive the raw client IP');
      assert(body.includes(hashRateLimitIdentifier(ip)), 'Both instances must share the hashed IP identity');
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
