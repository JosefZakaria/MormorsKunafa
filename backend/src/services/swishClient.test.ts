import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseSwishAmountToOre,
  parseSwishInstructionId,
  parseSwishRefundId,
  parseSwishEnvironment,
  resolveSwishInstructionId,
  validateSwishCallbackBaseUrl,
  verifySwishPaymentRequest,
  verifySwishRefund,
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

test('reuses a reserved Swish instruction instead of generating a second one', () => {
  const reserved = '123e4567-e89b-42d3-a456-426614174000';
  assert.equal(resolveSwishInstructionId(reserved), reserved);
  assert.match(resolveSwishInstructionId(), /^[0-9a-f-]{36}$/u);
  assert.throws(() => resolveSwishInstructionId('not-reserved-safely'));
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

test('parses Swish decimal amounts without floating point rounding', () => {
  assert.equal(parseSwishAmountToOre('179.90'), 17_990);
  assert.equal(parseSwishAmountToOre(179), 17_900);
  assert.equal(Number.isNaN(parseSwishAmountToOre('1.999')), true);
  assert.equal(Number.isNaN(parseSwishAmountToOre('not-an-amount')), true);
});

test('validates an exact final Swish refund result', () => {
  const refundId = '123E4567E89B42D3A456426614174000';
  const originalPaymentReference = '6D6CD7406ECE4542A80152D909EF9F6B';
  assert.equal(parseSwishRefundId(refundId.toLowerCase()), refundId);
  assert.deepEqual(verifySwishRefund({
    id: refundId,
    originalPaymentReference,
    amount: '79.50',
    currency: 'SEK',
    payerAlias: '1231181189',
    status: 'PAID',
  }, {
    refundId,
    originalPaymentReference,
    amountOre: 7_950,
    payerAlias: '1231181189',
  }), { ok: true, status: 'succeeded' });
});

test('rejects a Swish refund with mismatched immutable fields', () => {
  const expectedRefund = {
    refundId: '123E4567E89B42D3A456426614174000',
    originalPaymentReference: '6D6CD7406ECE4542A80152D909EF9F6B',
    amountOre: 7_950,
    payerAlias: '1231181189',
  };
  const base = {
    id: expectedRefund.refundId,
    originalPaymentReference: expectedRefund.originalPaymentReference,
    amount: '79.50',
    currency: 'SEK',
    payerAlias: expectedRefund.payerAlias,
    status: 'PAID',
  };
  assert.equal(verifySwishRefund({ ...base, amount: '79.51' }, expectedRefund).ok, false);
  assert.equal(verifySwishRefund({ ...base, currency: 'EUR' }, expectedRefund).ok, false);
  assert.equal(verifySwishRefund({ ...base, payerAlias: '9999999999' }, expectedRefund).ok, false);
  assert.equal(verifySwishRefund({ ...base, originalPaymentReference: 'A'.repeat(32) }, expectedRefund).ok, false);
});
