import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildVoiceProductChoices, voicePreparationMinutes } from '../dist/utils/voiceOrderPolicy.js';
import { resolveVoiceOpeningHours } from '../dist/utils/voiceOpeningHours.js';

const groundId = '77048580-fd68-454d-b34b-395b351a96d4';
const breadId = '856b591e-08b3-40ec-b505-cb3b143293bb';
const filledBreadId = '59ea8dfb-0d29-4792-bc24-5826cda4c09a';
const line = (productKey, optionKey, quantity) => ({ productKey, optionKey, quantity });
const find = (choices, key, option) => choices.find(product => product.key === key).options.find(item => item.key === option);

test('four large kunafa take 15 minutes; five take 20, also across separate lines', () => {
  assert.equal(voicePreparationMinutes([line('ground_cheese', 'large', 4)]), 15);
  assert.equal(voicePreparationMinutes([line('ground_cheese', 'large', 5)]), 20);
  assert.equal(voicePreparationMinutes([
    line('ground_cheese', 'large', 2), line('crispy_cheese', 'large', 3),
  ]), 20);
});

test('small kunafa and bread do not increase the large-kunafa count', () => {
  assert.equal(voicePreparationMinutes([
    line('crispy_cheese', 'large', 4), line('ground_cheese', 'small', 8),
    line('bread_only', 'unit', 10), line('kunafa_in_bread', 'unit', 10),
  ]), 15);
});

test('ashta has its own sizes and cannot be confused with ostkunafa', () => {
  const ashta = buildVoiceProductChoices([]).find(item => item.key === 'crispy_ashta');
  assert.deepEqual(ashta.options.map(item => item.persons), [3, 6]);
  assert.equal(voicePreparationMinutes([line('crispy_ashta', 'large', 5)]), 20);
  assert.throws(() => voicePreparationMinutes([line('crispy_ashta', '4 personer', 1)]));
});

test('current database prices win, including price changes between requests', () => {
  const product = { id: groundId, price_ore: 13900, variant_prices: { '2 personer': 13900, '4 personer': 23900 } };
  assert.equal(find(buildVoiceProductChoices([product]), 'ground_cheese', 'large').priceOre, 23900);
  product.variant_prices['4 personer'] = 25900;
  assert.equal(find(buildVoiceProductChoices([product]), 'ground_cheese', 'large').priceOre, 25900);
});

test('missing or invalid variant prices never fall back to the base price or historical defaults', () => {
  for (const variants of [undefined, {}, { '4 personer': '23900' }, { '4 personer': -1 }]) {
    const choice = find(buildVoiceProductChoices([{ id: groundId, price_ore: 13900, variant_prices: variants }]), 'ground_cheese', 'large');
    assert.equal(choice.priceOre, null);
    assert.equal(choice.catalogStatus, 'price_missing');
  }
});

test('plain bread and filled bread keep separate identities and prices', () => {
  const choices = buildVoiceProductChoices([
    { id: breadId, price_ore: 1500, variant_prices: { st: 1500 } },
    { id: filledBreadId, price_ore: 6900 },
  ]);
  assert.equal(find(choices, 'bread_only', 'unit').priceOre, 1500);
  assert.equal(find(choices, 'kunafa_in_bread', 'unit').priceOre, 6900);
  assert.equal(choices.find(item => item.key === 'kunafa_in_bread').texture, 'ground');
});

test('ashta kunafa never borrows a similarly named dessert; missing mappings and hidden products stay unavailable', () => {
  const choices = buildVoiceProductChoices([
    { id: 'fc469599-82e8-4ea3-aa18-0436bc2a2afd', price_ore: 14900 },
    { id: groundId, price_ore: 13900, variant_prices: { '2 personer': 13900 }, hidden: true },
  ]);
  assert.equal(find(choices, 'crispy_ashta', 'small').catalogStatus, 'product_missing');
  assert.equal(find(choices, 'large_tray', 'tray').catalogStatus, 'product_missing');
  assert.equal(find(choices, 'ground_cheese', 'small').catalogStatus, 'hidden');
  assert.equal(find(choices, 'ground_cheese', 'small').priceOre, null);
});

test('ambiguous, invalid and unsupported lines cannot silently receive a preparation estimate', () => {
  for (const lines of [[], [line('bread_only', 'large', 1)], [line('ground_cheese', 'large', 0)],
    [line('ground_cheese', 'large', 1.5)], [line('unknown', 'large', 1)], [line('large_tray', 'tray', 1)]]) {
    assert.throws(() => voicePreparationMinutes(lines));
  }
});

test('confirmed setup prices do not make missing products quotable or leak into the live catalog', () => {
  const choices = buildVoiceProductChoices([]);
  for (const key of ['crispy_ashta', 'large_tray']) {
    for (const option of choices.find(product => product.key === key).options) {
      assert.equal(option.priceOre, null);
      assert.equal(option.catalogStatus, 'product_missing');
      assert.equal(Object.hasOwn(option, 'setupPriceOre'), false);
    }
  }
});

test('Höja is closed on Mondays while Möllevången remains open; both open on Tuesday', () => {
  const base = { kind: 'owner_schedule' };
  assert.equal(resolveVoiceOpeningHours('hoja', '2026-11-09', base).hours, null);
  assert.deepEqual(resolveVoiceOpeningHours('mollevangen', '2026-11-09', base).hours, { open: '11:00', close: '22:00' });
  for (const location of ['hoja', 'mollevangen']) {
    assert.deepEqual(resolveVoiceOpeningHours(location, '2026-11-10', base).hours, { open: '11:00', close: '22:00' });
  }
});

test('current date-specific hours override the owner schedule, including exceptional opening or closure', () => {
  const changed = { kind: 'current_schedule', location: 'hoja', date: '2026-11-09', hours: { open: '12:00', close: '18:00' } };
  assert.deepEqual(resolveVoiceOpeningHours('hoja', '2026-11-09', changed).hours, changed.hours);
  const closed = resolveVoiceOpeningHours('mollevangen', '2026-11-10', {
    kind: 'current_schedule', location: 'mollevangen', date: '2026-11-10', hours: null,
  });
  assert.equal(closed.hours, null);
  assert.equal(closed.referToWebsite, false);
});

test('failed, wrong-date, wrong-location or malformed current hours refer to the website instead of old hours', () => {
  for (const source of [
    { kind: 'unavailable' },
    { kind: 'current_schedule', location: 'hoja', date: '2026-11-09', hours: null },
    { kind: 'current_schedule', location: 'mollevangen', date: '2026-11-11', hours: null },
    { kind: 'current_schedule', location: 'mollevangen', date: '2026-11-10', hours: { open: '25:00', close: '22:00' } },
  ]) {
    const result = resolveVoiceOpeningHours('mollevangen', '2026-11-10', source);
    assert.equal(result.referToWebsite, true);
    assert.equal(result.hours, null);
  }
  assert.throws(() => resolveVoiceOpeningHours('hoja', '2026-02-30', { kind: 'owner_schedule' }));
  assert.throws(() => resolveVoiceOpeningHours('unknown', '2026-11-10', { kind: 'owner_schedule' }));
});
