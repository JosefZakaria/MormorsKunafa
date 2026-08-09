import assert from 'node:assert/strict';
import test from 'node:test';
import {
  abandonOrderIdempotency,
  beginOrderIdempotency,
  completeOrderIdempotency,
  hashOrderPayload,
  parseOrderIdempotencyKey,
} from './orderIdempotency.js';

// Always exercise the isolated development fallback; tests must not contact Redis.
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

test('requires a bounded opaque idempotency key', () => {
  assert.equal(parseOrderIdempotencyKey('12345678-1234-4234-8234-123456789abc'), '12345678-1234-4234-8234-123456789abc');
  assert.throws(() => parseOrderIdempotencyKey('short'));
  assert.throws(() => parseOrderIdempotencyKey('bad key with spaces'));
});

test('hashes equivalent payloads deterministically', () => {
  assert.equal(hashOrderPayload({ b: 2, a: 1 }), hashOrderPayload({ a: 1, b: 2 }));
});

test('replays a completed local request and rejects key reuse with new input', async () => {
  const key = 'test-idempotency-key-00000001';
  const first = await beginOrderIdempotency(key, { order: 1 });
  assert.equal(first.kind, 'acquired');
  if (first.kind !== 'acquired') return;

  assert.equal((await beginOrderIdempotency(key, { order: 1 })).kind, 'processing');
  await completeOrderIdempotency(first.context, { id: 'order-1' });
  assert.deepEqual(await beginOrderIdempotency(key, { order: 1 }), {
    kind: 'replay',
    response: { id: 'order-1' },
  });
  assert.equal((await beginOrderIdempotency(key, { order: 2 })).kind, 'conflict');
  await abandonOrderIdempotency(first.context);
});
