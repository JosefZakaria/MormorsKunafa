import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request } from 'express';
import { resolveRateLimitAddress } from './rateLimit.js';

test('ignores caller-supplied forwarded headers outside Vercel', () => {
  const request = {
    ip: '198.51.100.50',
    headers: { 'x-forwarded-for': '203.0.113.99' },
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Request;
  assert.equal(resolveRateLimitAddress(request, false), '127.0.0.1');
});

test('uses Express resolved IP behind the trusted Vercel hop', () => {
  const request = {
    ip: '198.51.100.50',
    headers: { 'x-forwarded-for': '203.0.113.99' },
    socket: { remoteAddress: '10.0.0.2' },
  } as unknown as Request;
  assert.equal(resolveRateLimitAddress(request, true), '198.51.100.50');
});
