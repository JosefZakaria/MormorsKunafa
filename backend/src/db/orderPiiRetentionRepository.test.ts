import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOperationalPiiRetentionCandidate } from './orderPiiRetentionRepository.js';

test('parses a minimal non-PII retention candidate', () => {
  assert.deepEqual(parseOperationalPiiRetentionCandidate({
    order_id: '12345678-1234-4234-8234-123456789abc',
    order_number: '#0123',
    terminal_at: '2026-01-01T12:00:00.000Z',
    order_status: 'levererad',
    payment_status: 'paid',
  }), {
    orderId: '12345678-1234-4234-8234-123456789abc',
    orderNumber: '#0123',
    terminalAt: '2026-01-01T12:00:00.000Z',
    orderStatus: 'levererad',
    paymentStatus: 'paid',
  });
});

test('rejects malformed or non-terminal retention candidates', () => {
  const base = {
    order_id: '12345678-1234-4234-8234-123456789abc',
    order_number: '#0123',
    terminal_at: '2026-01-01T12:00:00.000Z',
    order_status: 'levererad',
    payment_status: 'paid',
  };
  assert.throws(() => parseOperationalPiiRetentionCandidate({ ...base, order_id: 'bad' }));
  assert.throws(() => parseOperationalPiiRetentionCandidate({ ...base, terminal_at: 'bad' }));
  assert.throws(() => parseOperationalPiiRetentionCandidate({ ...base, order_status: 'ny' }));
});
