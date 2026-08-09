import assert from 'node:assert/strict';
import test from 'node:test';
import { includedVatFromGrossOre, receiptVatRate } from './vat.js';

test('uses 12 percent for restaurant service eaten on site', () => {
  assert.equal(receiptVatRate('eat-here'), 12);
  assert.deepEqual(includedVatFromGrossOre(11_200, 'eat-here'), { rate: 12, vatOre: 1_200 });
});

test('uses 6 percent for takeaway and delivery food', () => {
  assert.equal(receiptVatRate('takeaway'), 6);
  assert.equal(receiptVatRate('delivery'), 6);
  assert.deepEqual(includedVatFromGrossOre(10_600, 'takeaway'), { rate: 6, vatOre: 600 });
});

test('never emits negative included VAT for malformed legacy totals', () => {
  assert.deepEqual(includedVatFromGrossOre(-100, 'delivery'), { rate: 6, vatOre: 0 });
});
