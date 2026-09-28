import assert from 'node:assert/strict';
import test from 'node:test';
import { parseVerifiedFoodInformationInput } from './foodInformationInput.js';

test('accepts reviewed made-to-order food information', () => {
  assert.deepEqual(parseVerifiedFoodInformationInput({
    ingredients: [
      { name: 'Filodeg', allergens: ['gluten'] },
      { name: 'Smör', allergens: ['milk'] },
      { name: 'Socker' },
    ],
    allergens: ['gluten', 'milk'],
    mayContainAllergens: ['nuts'],
    isPrepacked: false,
    verificationConfirmed: true,
  }), {
    ingredients: [
      { name: 'Filodeg', allergens: ['gluten'] },
      { name: 'Smör', allergens: ['milk'] },
      { name: 'Socker' },
    ],
    allergens: ['gluten', 'milk'],
    mayContainAllergens: ['nuts'],
    isPrepacked: false,
  });
});

test('rejects unconfirmed, malformed and internally inconsistent food information', () => {
  const valid = {
    ingredients: [{ name: 'Smör', allergens: ['milk'] }],
    allergens: ['milk'],
    mayContainAllergens: [],
    isPrepacked: false,
    verificationConfirmed: true,
  };
  assert.equal(parseVerifiedFoodInformationInput({ ...valid, verificationConfirmed: false }), null);
  assert.equal(parseVerifiedFoodInformationInput({ ...valid, allergens: [] }), null);
  assert.equal(parseVerifiedFoodInformationInput({ ...valid, mayContainAllergens: ['milk'] }), null);
  assert.equal(parseVerifiedFoodInformationInput({ ...valid, ingredients: [{ name: 'Smör\n' }] }), null);
  assert.equal(parseVerifiedFoodInformationInput({ ...valid, unknown: true }), null);
});
