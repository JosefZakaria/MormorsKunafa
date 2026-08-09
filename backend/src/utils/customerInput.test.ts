import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CustomerInputError,
  validateCustomerInput,
  validateScheduledTimeInput,
} from './customerInput.js';

test('keeps only required delivery fields and avoids duplicate contact data', () => {
  assert.deepEqual(
    validateCustomerInput(
      { name: '  Ada   Lovelace ', phone: '+46 70 123 45 67', email: 'ADA@EXAMPLE.SE' },
      { address: 'Testgatan 1', postalCode: '123 45', city: 'Stockholm', extra: 'discarded' },
      true
    ),
    {
      customerName: 'Ada Lovelace',
      customerPhone: '+46 70 123 45 67',
      customerEmail: 'ada@example.se',
      deliveryInfo: { address: 'Testgatan 1', postalCode: '123 45', city: 'Stockholm' },
    }
  );
});

test('rejects printer and terminal control characters', () => {
  assert.throws(
    () => validateCustomerInput({ name: 'Ada\u001b[2J', phone: '0701234567' }, null, false),
    CustomerInputError
  );
});

test('rejects implausible phone numbers and oversized names', () => {
  assert.throws(
    () => validateCustomerInput({ name: 'A'.repeat(101), phone: '0701234567' }, null, false),
    CustomerInputError
  );
  assert.throws(
    () => validateCustomerInput({ name: 'Ada', phone: '123' }, null, false),
    CustomerInputError
  );
});

test('bounds and rejects control characters in scheduled time input', () => {
  assert.equal(validateScheduledTimeInput('2026-08-10T12:30:00'), '2026-08-10T12:30:00');
  assert.throws(() => validateScheduledTimeInput(`2026-08-10T12:30\u001b`), CustomerInputError);
  assert.throws(() => validateScheduledTimeInput('x'.repeat(41)), CustomerInputError);
});
