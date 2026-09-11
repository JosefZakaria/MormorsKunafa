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

test('shared clients accept v1 and v2 status capabilities while unknown formats fail closed', () => {
  const suffix = `9999999999.${'a'.repeat(22)}.${'b'.repeat(43)}`;
  for (const version of ['v1', 'v2']) {
    const token = `${version}.${suffix}`;
    assert.equal(isOrderStatusCapability(token), true);
    assert.equal(classifyCheckoutCreateResponse({ checkoutContract: 'order-v2', statusToken: token }), 'current');
  }
  for (const token of [
    `v0.${suffix}`, `v3.${suffix}`, `v12.${suffix}`, `V2.${suffix}`, `v2.${suffix}.extra`,
    `v2.999999999.${'a'.repeat(22)}.${'b'.repeat(43)}`,
    `v2.9999999999.${'a'.repeat(21)}.${'b'.repeat(43)}`,
    `v2.9999999999.${'a'.repeat(22)}.${'b'.repeat(42)}`,
  ]) {
    assert.equal(isOrderStatusCapability(token), false);
    assert.equal(classifyCheckoutCreateResponse({ checkoutContract: 'order-v2', statusToken: token }), 'unknown');
  }
});
