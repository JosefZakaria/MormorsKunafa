import assert from 'node:assert/strict';
import test from 'node:test';
import type { Row } from '../db/connection.js';
import { OrderValidationError, priceValidatedProductRows } from './orderPricing.js';

const pistachioId = '1ae3fd7a-0042-4220-b330-b27b3147a0a6';
const fixedId = 'c005c8af-3f2e-401c-923f-7dac0f682cda';

function product(id: string, overrides: Row = {}): Row {
  return { id, name: 'Databasnamn', price_ore: 99900, stock_status: 'instock', ...overrides };
}

test('uses the server catalog price and database name', () => {
  const [line] = priceValidatedProductRows(
    [{ productId: pistachioId, variantId: '250 gram', quantity: 2 }],
    [product(pistachioId)]
  );
  assert.deepEqual(line, {
    productId: pistachioId,
    productNameSnapshot: 'Databasnamn - 250 gram',
    quantity: 2,
    priceOre: 8900,
  });
});

test('rejects a client-invented variant', () => {
  assert.throws(
    () => priceValidatedProductRows(
      [{ productId: pistachioId, variantId: 'billig', quantity: 1 }],
      [product(pistachioId)]
    ),
    OrderValidationError
  );
});

test('rejects out-of-stock products', () => {
  assert.throws(
    () => priceValidatedProductRows(
      [{ productId: fixedId, variantId: '1 kg', quantity: 1 }],
      [product(fixedId, { stock_status: 'outofstock' })]
    ),
    OrderValidationError
  );
});

test('uses editable server variant prices and rejects hidden or malformed products', () => {
  const input = [{ productId: pistachioId, variantId: '250 gram', quantity: 2 }];
  const row = product(pistachioId, { variant_prices: { '250 gram': 12345 } });
  assert.equal(priceValidatedProductRows(input, [row])[0].priceOre, 12345);
  assert.throws(() => priceValidatedProductRows(input, [{ ...row, hidden: true }]), OrderValidationError);
  assert.throws(() => priceValidatedProductRows(input, [{ ...row, variant_prices: { '250 gram': -1 } }]), OrderValidationError);
  assert.throws(() => priceValidatedProductRows([{ ...input[0], variantId: 'constructor' }], [row]), OrderValidationError);
});

test('supports new per-piece products and the existing quantity label without trusting its price', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const row = product(id, { variant_prices: { st: 4500 } });
  const input = [{ productId: id, variantId: '3 st', quantity: 3 }];
  const line = priceValidatedProductRows(input, [row])[0];
  assert.equal(line.priceOre, 4500);
  assert.equal(line.quantity, 3);
  assert.throws(() => priceValidatedProductRows([{ ...input[0], variantId: '1 st' }], [row]), OrderValidationError);
});
