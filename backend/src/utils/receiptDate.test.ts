import assert from 'node:assert/strict';
import test from 'node:test';
import { formatVerifiedReceiptDate } from './receiptDate.js';

test('formats the verified payment instant in Stockholm time', () => {
  const formatted = formatVerifiedReceiptDate('2026-08-09T10:30:00.000Z');
  assert.match(formatted, /9 augusti 2026/u);
  assert.match(formatted, /12:30/u);
});

test('does not invent a receipt date for missing or invalid values', () => {
  assert.equal(formatVerifiedReceiptDate(undefined), '');
  assert.equal(formatVerifiedReceiptDate('invalid'), '');
});
