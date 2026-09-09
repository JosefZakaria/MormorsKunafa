import assert from 'node:assert/strict';
import test from 'node:test';
import type { Row } from '../db/connection.js';
import {
  OrderValidationError,
  priceValidatedProductRows,
  validateOrderItemInputs,
} from './orderPricing.js';
import { cartItemToOrderLine } from '../shared/utils/cartOrderLine.js';

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
  assert.equal(priceValidatedProductRows([{ ...input[0], variantId: '1 st' }], [row])[0].priceOre, 4500);
});

test('current and cached per-piece carts preserve changed quantities using server catalog prices', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const row = product(id, { variant_prices: { st: 4500 } });
  for (const suffix of ['3 st', 'st']) {
    const input = cartItemToOrderLine({ productId: `${id}-${suffix}`, quantity: 4, price: 1, productName: 'FORGED' } as {productId:string;quantity:number});
    assert.deepEqual(input, {
      productId:`${id}-${suffix}`,
      variantId:suffix,
      productName:'FORGED',
      price:1,
      quantity:4,
    });
    const validated = validateOrderItemInputs([input]);
    const line = priceValidatedProductRows(validated, [row])[0];
    assert.equal(line.priceOre * line.quantity, 18000);
    assert.equal(line.productNameSnapshot, 'Databasnamn - 4 st');
    assert.throws(() => priceValidatedProductRows(validated, [product(id)]), OrderValidationError);
  }
  assert.deepEqual(
    cartItemToOrderLine({productId:`${pistachioId}-250 gram`,quantity:2}),
    {productId:`${pistachioId}-250 gram`,variantId:'250 gram',quantity:2}
  );
  for (const variant_prices of [{ '3 st':12000,'6 st':22000 }, { st:4500,'3 st':12000 }]) {
    const input = cartItemToOrderLine({productId:`${id}-3 st`,quantity:1});
    assert.equal(priceValidatedProductRows(validateOrderItemInputs([input]),[product(id,{variant_prices})])[0].priceOre,12000,'Preserve real bundle labels even when a st variant also exists');
  }
});

test('canonicalizes the legacy composite id without trusting compatibility fields', () => {
  const [input] = validateOrderItemInputs([{
    productId: `${pistachioId}-250 gram`,
    variantId: '250 gram',
    productName: 'FORGED',
    price: 1,
    quantity: 2,
  }]);
  assert.deepEqual(input, { productId: pistachioId, variantId: '250 gram', quantity: 2 });
  assert.equal(priceValidatedProductRows([input], [product(pistachioId)])[0].priceOre, 8900);
});

test('rejects conflicting or malformed composite variants', () => {
  assert.throws(() => validateOrderItemInputs([{
    productId: `${pistachioId}-250 gram`, variantId: '1 kg', quantity: 1,
  }]), OrderValidationError);
  assert.throws(() => validateOrderItemInputs([{
    productId: `${pistachioId}-`, quantity: 1,
  }]), OrderValidationError);
  assert.throws(() => validateOrderItemInputs([{
    productId: `${pistachioId}-${'x'.repeat(81)}`, quantity: 1,
  }]), OrderValidationError);
});
