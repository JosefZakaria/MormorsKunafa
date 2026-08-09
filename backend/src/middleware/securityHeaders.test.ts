import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { applyApiSecurityHeaders } from './securityHeaders.js';

function run(path: string): Map<string, string> {
  const headers = new Map<string, string>();
  const response = {
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
  } as unknown as Response;
  let continued = false;
  applyApiSecurityHeaders({ path } as Request, response, (() => { continued = true; }) as NextFunction);
  assert.equal(continued, true);
  return headers;
}

test('sets restrictive API browser headers', () => {
  const headers = run('/api/products');
  assert.match(headers.get('content-security-policy') ?? '', /default-src 'none'/);
  assert.match(headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('x-xss-protection'), '0');
});

test('prevents caching of admin and customer order responses', () => {
  assert.equal(run('/api/admin/session').get('cache-control'), 'private, no-store');
  assert.equal(run('/api/orders/order-id').get('cache-control'), 'private, no-store');
  assert.equal(run('/api/products').has('cache-control'), false);
});
