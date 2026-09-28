import assert from 'node:assert/strict';
import test from 'node:test';
import { isCanonicalUuidV4 } from './resourceId.js';

test('accepts only canonical version 4 resource identifiers', () => {
  assert.equal(isCanonicalUuidV4('123e4567-e89b-42d3-a456-426614174000'), true);
  assert.equal(isCanonicalUuidV4('123e4567-e89b-12d3-a456-426614174000'), false);
  assert.equal(isCanonicalUuidV4('../metadata'), false);
  assert.equal(isCanonicalUuidV4('x'.repeat(10_000)), false);
  assert.equal(isCanonicalUuidV4(undefined), false);
});
