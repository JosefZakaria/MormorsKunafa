import assert from 'node:assert/strict';
import test from 'node:test';
import { consumeRealtimeTicket, issueRealtimeTicket } from './realtimeTicket.js';

test('issues a short-lived ticket that can be consumed exactly once', async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const now = Date.now();
  const issued = await issueRealtimeTicket('admin-1', 4, now);

  assert.equal(issued.expiresInSeconds, 60);
  assert.deepEqual(await consumeRealtimeTicket(issued.ticket, now + 1), {
    adminId: 'admin-1',
    tokenVersion: 4,
    expiresAt: now + 60_000,
  });
  assert.equal(await consumeRealtimeTicket(issued.ticket, now + 2), null);
});

test('rejects expired and malformed realtime tickets', async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const now = Date.now();
  const issued = await issueRealtimeTicket('admin-2', 1, now);

  assert.equal(await consumeRealtimeTicket('not-a-ticket', now), null);
  assert.equal(await consumeRealtimeTicket(issued.ticket, now + 60_001), null);
});
