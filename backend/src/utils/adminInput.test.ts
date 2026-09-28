import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AdminInputError,
  parseDateOnly,
  parseEstimatedReadyTime,
  parseHistoryLimit,
  parseInternalNotes,
  parseAdminLoginInput,
  parseOptionalBoolean,
  parsePreparationMinutes,
  parseStatisticsRange,
} from './adminInput.js';

test('bounds preparation time and history pagination', () => {
  assert.equal(parsePreparationMinutes(30), 30);
  assert.equal(parseHistoryLimit('50'), 50);
  assert.throws(() => parsePreparationMinutes(0), AdminInputError);
  assert.throws(() => parsePreparationMinutes(12.5), AdminInputError);
  assert.throws(() => parseHistoryLimit('10000'), AdminInputError);
});

test('validates login size, booleans and complete statistics ranges', () => {
  assert.deepEqual(parseAdminLoginInput(' ADMIN@example.com ', 'secret'), {
    email: 'admin@example.com',
    password: 'secret',
  });
  assert.throws(() => parseAdminLoginInput('invalid', 'secret'), AdminInputError);
  assert.throws(() => parseAdminLoginInput('admin@example.com', 'x'.repeat(73)), AdminInputError);
  assert.equal(parseOptionalBoolean(false, 'Paus'), false);
  assert.throws(() => parseOptionalBoolean('false', 'Paus'), AdminInputError);
  assert.deepEqual(parseStatisticsRange('2026-01-01', '2026-01-31'), {
    startDate: '2026-01-01',
    endDate: '2026-01-31',
  });
  assert.throws(() => parseStatisticsRange('2026-01-01', undefined), AdminInputError);
  assert.throws(() => parseStatisticsRange('2026-02-01', '2026-01-01'), AdminInputError);
});

test('strictly validates dates and timestamps', () => {
  assert.equal(parseDateOnly('2026-08-09', 'Från'), '2026-08-09');
  assert.throws(() => parseDateOnly('2026-02-30', 'Från'), AdminInputError);
  assert.throws(() => parseDateOnly('not-a-date', 'Från'), AdminInputError);
  assert.equal(parseEstimatedReadyTime('2026-08-09T10:30:00+02:00'), '2026-08-09T08:30:00.000Z');
  assert.throws(() => parseEstimatedReadyTime('invalid'), AdminInputError);
});

test('bounds notes and rejects terminal control characters', () => {
  assert.equal(parseInternalNotes(' Ring kunden '), 'Ring kunden');
  assert.equal(parseInternalNotes(''), null);
  assert.throws(() => parseInternalNotes('unsafe\u001b[2J'), AdminInputError);
  assert.throws(() => parseInternalNotes('x'.repeat(2_001)), AdminInputError);
});
