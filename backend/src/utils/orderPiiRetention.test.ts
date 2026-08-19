import assert from 'node:assert/strict';
import test from 'node:test';
import {
  operationalPiiCutoff,
  parseOperationalPiiRetentionRequest,
} from './orderPiiRetention.js';

test('operational PII retention defaults to a dry run and bounded batch', () => {
  assert.deepEqual(parseOperationalPiiRetentionRequest({ retentionDays: 90 }), {
    retentionDays: 90,
    limit: 100,
    dryRun: true,
  });
});

test('operational PII retention accepts an explicit execution request', () => {
  assert.deepEqual(parseOperationalPiiRetentionRequest({
    retentionDays: 365,
    limit: 500,
    dryRun: false,
  }), {
    retentionDays: 365,
    limit: 500,
    dryRun: false,
  });
});

test('operational PII retention rejects unsafe or malformed requests', () => {
  assert.equal(parseOperationalPiiRetentionRequest({ retentionDays: 29 }), null);
  assert.equal(parseOperationalPiiRetentionRequest({ retentionDays: 90, limit: 501 }), null);
  assert.equal(parseOperationalPiiRetentionRequest({ retentionDays: 90, dryRun: 'false' }), null);
  assert.equal(parseOperationalPiiRetentionRequest({ retentionDays: 90, extra: true }), null);
  assert.equal(parseOperationalPiiRetentionRequest(null), null);
});

test('operational PII cutoff is deterministic and refuses short retention', () => {
  const now = Date.parse('2026-08-19T12:00:00.000Z');
  assert.equal(operationalPiiCutoff(30, now), '2026-07-20T12:00:00.000Z');
  assert.throws(() => operationalPiiCutoff(1, now));
});
