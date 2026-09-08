import assert from 'node:assert/strict';
import test from 'node:test';
import { validateOrderSchedule } from './orderSchedule.js';

test('schedule validation uses Stockholm hours for offset timestamps', () => {
  const now = new Date('2026-09-08T08:00:00Z');
  assert.equal(validateOrderSchedule('2026-09-09T14:00+14:00',30,now).valid,false);
  const equivalent = validateOrderSchedule('2026-09-09T12:00Z',30,now);
  assert.equal(equivalent.valid,true);
  if (equivalent.valid) assert.equal(equivalent.scheduledAt?.toISOString(),'2026-09-09T12:00:00.000Z');
});

test('schedule accepts the last selectable day and rejects past or excessive dates', () => {
  const now = new Date('2026-09-08T08:00:00Z');
  assert.equal(validateOrderSchedule('2026-10-08T14:00',30,now).valid,true);
  for (const value of ['2026-10-09T14:00','2026-09-07T14:00','2026-02-31T14:00','invalid']) {
    assert.equal(validateOrderSchedule(value,30,now).valid,false,value);
  }
});
