import assert from 'node:assert/strict';
import test from 'node:test';
import {
  expectedRefundConfirmation,
  parseRefundIdempotencyKey,
  parseRefundRequest,
  RefundInputError,
} from './refundSelection.js';

const itemId = '123e4567-e89b-42d3-a456-426614174000';

test('parses an exact order-bound refund confirmation', () => {
  const result = parseRefundRequest({
    password: 'temporary test password',
    confirmation: 'ÅTERBETALA #0042',
    items: [{ orderItemId: itemId.toUpperCase(), quantity: 2 }],
  }, '#0042');

  assert.equal(expectedRefundConfirmation('#0042'), 'ÅTERBETALA #0042');
  assert.deepEqual(result.items, [{ orderItemId: itemId, quantity: 2 }]);
});

test('rejects confirmation for another order and duplicate item rows', () => {
  assert.throws(() => parseRefundRequest({
    password: 'test password',
    confirmation: 'ÅTERBETALA #0043',
    items: [{ orderItemId: itemId, quantity: 1 }],
  }, '#0042'), RefundInputError);

  assert.throws(() => parseRefundRequest({
    password: 'test password',
    confirmation: 'ÅTERBETALA #0042',
    items: [
      { orderItemId: itemId, quantity: 1 },
      { orderItemId: itemId, quantity: 1 },
    ],
  }, '#0042'), RefundInputError);
});

test('rejects malformed quantities and idempotency keys', () => {
  for (const quantity of [0, 1.5, 51, '1']) {
    assert.throws(() => parseRefundRequest({
      password: 'test password',
      confirmation: 'ÅTERBETALA #0042',
      items: [{ orderItemId: itemId, quantity }],
    }, '#0042'), RefundInputError);
  }
  assert.equal(parseRefundIdempotencyKey('refund:1234567890abcdef'), 'refund:1234567890abcdef');
  assert.throws(() => parseRefundIdempotencyKey('short'), RefundInputError);
  assert.throws(() => parseRefundIdempotencyKey('x'.repeat(129)), RefundInputError);
});
