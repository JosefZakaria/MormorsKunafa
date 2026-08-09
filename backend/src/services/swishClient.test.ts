import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseSwishInstructionId,
  parseSwishEnvironment,
  validateSwishCallbackBaseUrl,
  verifySwishPaymentRequest,
  type SwishPaymentRequestResponse,
} from './swishClient.js';

const expected = {
  instructionId: 'bd7204c1-3ec1-4b18-a52c-f6f8544f012f',
  amountOre: 17_900,
  payeeAlias: '1231181189',
  payeePaymentReference: 'a96c113d-9c7b-4e93-b247-2a3baf0',
};

function payment(overrides: Partial<SwishPaymentRequestResponse> = {}): SwishPaymentRequestResponse {
  return {
    id: expected.instructionId,
    status: 'PAID',
    amount: 179,
    currency: 'SEK',
    payeeAlias: expected.payeeAlias,
    payeePaymentReference: expected.payeePaymentReference,
    ...overrides,
  };
}

test('accepts an exact Swish API payment match', () => {
  assert.deepEqual(verifySwishPaymentRequest(payment(), expected), {
    ok: true,
    paidAmountOre: 17_900,
  });
});

for (const [name, override] of [
  ['amount', { amount: 0.01 }],
  ['currency', { currency: 'EUR' }],
  ['payee', { payeeAlias: '1230000000' }],
  ['reference', { payeePaymentReference: 'another-order' }],
] as const) {
  test(`rejects a Swish ${name} mismatch`, () => {
    assert.equal(verifySwishPaymentRequest(payment(override), expected).ok, false);
  });
}

test('accepts only canonical version 4 Swish instruction identifiers', () => {
  assert.equal(
    parseSwishInstructionId('123e4567-e89b-42d3-a456-426614174000'),
    '123e4567-e89b-42d3-a456-426614174000'
  );
  assert.equal(parseSwishInstructionId('123e4567-e89b-12d3-a456-426614174000'), null);
  assert.equal(parseSwishInstructionId('../metadata'), null);
  assert.equal(parseSwishInstructionId('x'.repeat(1_000)), null);
});

test('accepts only explicit Swish environments and clean HTTPS callback bases', () => {
  assert.equal(parseSwishEnvironment(' LIVE '), 'production');
  assert.equal(parseSwishEnvironment('mss'), 'test');
  assert.throws(() => parseSwishEnvironment('staging'));
  assert.equal(
    validateSwishCallbackBaseUrl('https://api.mormorskunafa.se/'),
    'https://api.mormorskunafa.se'
  );
  assert.throws(() => validateSwishCallbackBaseUrl('http://api.mormorskunafa.se'));
  assert.throws(() => validateSwishCallbackBaseUrl('https://user:pass@api.mormorskunafa.se'));
  assert.throws(() => validateSwishCallbackBaseUrl('https://api.mormorskunafa.se?token=secret'));
});
