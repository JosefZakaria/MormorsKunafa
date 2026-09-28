import assert from 'node:assert/strict';
import test from 'node:test';
import { validMaintenanceAuthorization } from './maintenanceAuth.js';

test('accepts only the exact strong maintenance bearer secret', () => {
  const secret = 'maintenance-secret-with-at-least-32-bytes';
  assert.equal(validMaintenanceAuthorization(`Bearer ${secret}`, secret), true);
  assert.equal(validMaintenanceAuthorization(`Bearer ${secret}x`, secret), false);
  assert.equal(validMaintenanceAuthorization('Basic anything', secret), false);
  assert.equal(validMaintenanceAuthorization(undefined, secret), false);
});

test('fails closed when the configured maintenance secret is weak', () => {
  assert.equal(validMaintenanceAuthorization('Bearer short', 'short'), false);
});
