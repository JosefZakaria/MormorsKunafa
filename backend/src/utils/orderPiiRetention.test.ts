import assert from 'node:assert/strict';
import test from 'node:test';
import {
  operationalPiiCutoff,
  parseOperationalPiiRetentionRequest,
  retentionDaysForScope,
} from './orderPiiRetention.js';

test('operational-details retention defaults to a dry run and bounded batch', () => {
  assert.deepEqual(parseOperationalPiiRetentionRequest({ scope: 'operational_details' }), {
    scope: 'operational_details',
    limit: 100,
    dryRun: true,
  });
});

test('customer-contact retention accepts an explicit execution request', () => {
  assert.deepEqual(parseOperationalPiiRetentionRequest({
    scope: 'customer_contact',
    limit: 500,
    dryRun: false,
  }), {
    scope: 'customer_contact',
    limit: 500,
    dryRun: false,
  });
});

test('operational PII retention rejects unsafe or malformed requests', () => {
  assert.equal(parseOperationalPiiRetentionRequest({ scope: 'arbitrary' }), null);
  assert.equal(parseOperationalPiiRetentionRequest({ scope: 'operational_details', limit: 501 }), null);
  assert.equal(parseOperationalPiiRetentionRequest({ scope: 'customer_contact', dryRun: 'false' }), null);
  assert.equal(parseOperationalPiiRetentionRequest({ scope: 'customer_contact', retentionDays: 30 }), null);
  assert.equal(parseOperationalPiiRetentionRequest(null), null);
});

test('operational PII cutoffs are fixed to 90 and 1095 days', () => {
  const now = Date.parse('2026-08-19T12:00:00.000Z');
  assert.equal(
    operationalPiiCutoff('operational_details', now),
    '2026-05-21T12:00:00.000Z'
  );
  assert.equal(
    operationalPiiCutoff('customer_contact', now),
    '2023-08-20T12:00:00.000Z'
  );
  assert.equal(retentionDaysForScope('operational_details'), 90);
  assert.equal(retentionDaysForScope('customer_contact'), 1095);
});
