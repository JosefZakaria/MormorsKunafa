import assert from 'node:assert/strict';
import test from 'node:test';
import { isCurrentCheckoutContract } from './checkoutContract.js';
import {
  classifyCheckoutCreateResponse,
  isOrderStatusCapability,
} from '../shared/constants/checkoutContract.js';

test('accepts only the exact current checkout contract', () => {
  assert.equal(isCurrentCheckoutContract('order-v2'), true);
  for (const value of [undefined, '', ' order-v2', 'order-v2 ', 'ORDER-V2', ['order-v2']]) {
    assert.equal(isCurrentCheckoutContract(value), false);
  }
});

test('classifies only a complete status capability as the current response', () => {
  const token = `v1.9999999999.${'a'.repeat(22)}.${'b'.repeat(43)}`;
  assert.equal(isOrderStatusCapability(token), true);
  assert.equal(classifyCheckoutCreateResponse({
    checkoutContract: 'order-v2', statusToken: token,
  }), 'current');
  assert.equal(classifyCheckoutCreateResponse({}), 'legacy');
  assert.equal(classifyCheckoutCreateResponse({ statusToken: token }), 'unknown');
  assert.equal(classifyCheckoutCreateResponse({ checkoutContract: 'order-v2' }), 'unknown');
  assert.equal(classifyCheckoutCreateResponse({
    checkoutContract: 'order-v2', statusToken: 'undefined',
  }), 'unknown');
});
