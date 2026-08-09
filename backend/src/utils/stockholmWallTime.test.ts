import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOrderScheduledAt } from './stockholmWallTime.js';

test('parses Stockholm winter and summer wall time without scanning seconds', () => {
  assert.equal(parseOrderScheduledAt('2026-01-15T12:30:01')?.toISOString(), '2026-01-15T11:30:01.000Z');
  assert.equal(parseOrderScheduledAt('2026-07-15T12:30:01')?.toISOString(), '2026-07-15T10:30:01.000Z');
});

test('rejects invalid calendar values and DST gaps', () => {
  assert.equal(parseOrderScheduledAt('2026-02-31T12:30:00'), null);
  assert.equal(parseOrderScheduledAt('2026-03-29T02:30:00'), null);
  assert.equal(parseOrderScheduledAt('not-a-date'), null);
});

test('parses explicit offsets without changing their instant', () => {
  assert.equal(parseOrderScheduledAt('2026-07-15T12:30:01+02:00')?.toISOString(), '2026-07-15T10:30:01.000Z');
});
