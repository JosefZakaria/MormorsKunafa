import assert from 'node:assert/strict';
import test from 'node:test';
import { hasRealtimeCapacity } from './realtimeCapacity.js';

test('bounds realtime clients globally and per admin', () => {
  assert.equal(hasRealtimeCapacity({ totalClients: 4, byAdmin: { a: 4 } }, 'a'), true);
  assert.equal(hasRealtimeCapacity({ totalClients: 5, byAdmin: { a: 5 } }, 'a'), false);
  assert.equal(hasRealtimeCapacity({ totalClients: 100, byAdmin: {} }, 'a'), false);
  assert.equal(hasRealtimeCapacity({ totalClients: -1, byAdmin: {} }, 'a'), false);
});
