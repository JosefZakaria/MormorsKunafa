import assert from 'node:assert/strict';
import test from 'node:test';
import { safeErrorMetadata } from './safeErrorMetadata.js';

test('retains only bounded operational error identifiers', () => {
  assert.deepEqual(
    safeErrorMetadata({
      name: 'PostgrestError',
      code: '23505',
      status: 409,
      message: 'Key (email)=(customer@example.se) already exists',
      details: { customerPhone: '+46700000000' },
      stack: 'secret stack',
    }),
    { name: 'PostgrestError', code: '23505', statusCode: 409 }
  );
});

test('drops attacker-controlled or malformed metadata', () => {
  assert.deepEqual(safeErrorMetadata(null), {});
  assert.deepEqual(safeErrorMetadata({
    name: 'Error\ncustomer@example.se',
    code: 'x'.repeat(100),
    statusCode: 999,
  }), {});
});
