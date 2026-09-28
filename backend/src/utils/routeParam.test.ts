import assert from 'node:assert/strict';
import test from 'node:test';
import { joinedWildcardRouteParam, singleRouteParam } from './routeParam.js';

test('accepts only singular route parameter strings', () => {
  assert.equal(singleRouteParam('order-123'), 'order-123');
  assert.equal(singleRouteParam(['order-123']), '');
  assert.equal(singleRouteParam([]), '');
  assert.equal(singleRouteParam(undefined), '');
});

test('joins Express 5 wildcard segments without accepting malformed shapes', () => {
  assert.equal(joinedWildcardRouteParam(['hero', 'desktop.jpg']), 'hero/desktop.jpg');
  assert.equal(joinedWildcardRouteParam('hero/desktop.jpg'), 'hero/desktop.jpg');
  assert.equal(joinedWildcardRouteParam([]), '');
  assert.equal(joinedWildcardRouteParam(undefined), '');
});
