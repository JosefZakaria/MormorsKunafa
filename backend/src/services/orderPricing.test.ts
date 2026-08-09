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
