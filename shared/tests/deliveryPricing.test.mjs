import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  INITIAL_DELIVERY_PRICING,
  parseDeliveryPricing,
  quoteDelivery,
} from '../dist/utils/deliveryPricing.js';

const initial = () => parseDeliveryPricing(INITIAL_DELIVERY_PRICING);

for (const [city, feeOre] of [
  ['Malmö', 7900], ['Lund', 11900], ['Burlöv', 11900], ['Arlöv', 11900], ['Helsingborg', 14900],
]) {
  test(`${city}: correct price and no 1–2 day estimate`, () => {
    assert.deepEqual(quoteDelivery(city, initial()), {
      feeOre, matchedCity: city, showDeliveryEstimate: false,
    });
  });
}

test('other cities use the national price and show the delivery estimate', () => {
  const pricing = initial();
  pricing.defaultFeeOre = 9900;
  assert.deepEqual(quoteDelivery('Stockholm', pricing), {
    feeOre: 9900, matchedCity: null, showDeliveryEstimate: true,
  });
  assert.equal(quoteDelivery('Malmö', pricing).feeOre, 7900);
  assert.equal(quoteDelivery('Malmö kommun', pricing).matchedCity, null);
});

test('city matching handles case, whitespace and equivalent Unicode', () => {
  assert.equal(quoteDelivery('  MALMO\u0308  ', initial()).matchedCity, 'Malmö');
  const pricing = parseDeliveryPricing({
    defaultFeeOre: 7900, cityFees: [{ city: '  Upplands   Väsby ', feeOre: 11900 }],
  });
  assert.equal(quoteDelivery('upplands väsby', pricing).feeOre, 11900);
});

test('adding, changing and removing a city affects subsequent quotes', () => {
  const pricing = initial();
  pricing.cityFees.push({ city: 'Göteborg', feeOre: 15900 });
  assert.equal(quoteDelivery('Göteborg', pricing).feeOre, 15900);
  const previousQuote = quoteDelivery('Lund', pricing);
  pricing.cityFees.find((entry) => entry.city === 'Lund').feeOre = 12900;
  assert.equal(quoteDelivery('Lund', pricing).feeOre, 12900);
  assert.equal(previousQuote.feeOre, 11900);
  pricing.cityFees = pricing.cityFees.filter((entry) => entry.city !== 'Lund');
  assert.deepEqual(quoteDelivery('Lund', pricing), {
    feeOre: 7900, matchedCity: null, showDeliveryEstimate: true,
  });
});

test('free delivery and an empty city list are valid', () => {
  const pricing = parseDeliveryPricing({ defaultFeeOre: 0, cityFees: [{ city: 'Lund', feeOre: 0 }] });
  assert.equal(quoteDelivery('Lund', pricing).showDeliveryEstimate, false);
  assert.equal(quoteDelivery('Stockholm', pricing).feeOre, 0);
  assert.equal(quoteDelivery('Malmö', parseDeliveryPricing({ defaultFeeOre: 7900, cityFees: [] })).showDeliveryEstimate, true);
});

test('invalid amounts are rejected for both national and city prices', () => {
  for (const feeOre of [-1, 79.5, NaN, Infinity, '7900', null, undefined, 2147483648]) {
    assert.throws(() => parseDeliveryPricing({ defaultFeeOre: feeOre, cityFees: [] }));
    assert.throws(() => parseDeliveryPricing({ defaultFeeOre: 7900, cityFees: [{ city: 'Lund', feeOre }] }));
  }
});

test('invalid settings, empty cities and normalized duplicates are rejected', () => {
  for (const value of [null, [], {}, { defaultFeeOre: 7900, cityFees: {} }]) {
    assert.throws(() => parseDeliveryPricing(value));
  }
  for (const entry of [null, {}, { city: ' ', feeOre: 7900 }, { city: 123, feeOre: 7900 }]) {
    assert.throws(() => parseDeliveryPricing({ defaultFeeOre: 7900, cityFees: [entry] }));
  }
  assert.throws(() => parseDeliveryPricing({
    defaultFeeOre: 7900,
    cityFees: [{ city: 'Malmö', feeOre: 7900 }, { city: ' MALMO\u0308 ', feeOre: 11900 }],
  }), /finns redan/);
  assert.throws(() => quoteDelivery('  ', initial()), /Ange ort/);
});
