import assert from 'node:assert/strict';
import test from 'node:test';
import { assertOperationalSecretsConfiguration } from './operationalSecrets.js';

function withProductionSecrets(
  values: { jwt?: string; deletion?: string; statistics?: string },
  action: () => void
): void {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
    DELETE_PASSWORD: process.env.DELETE_PASSWORD,
    STATS_PASSWORD: process.env.STATS_PASSWORD,
  };
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = values.jwt;
  process.env.DELETE_PASSWORD = values.deletion;
  process.env.STATS_PASSWORD = values.statistics;
  try {
    action();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('rejects missing, short and reused production operational secrets', () => {
  withProductionSecrets({}, () => assert.throws(assertOperationalSecretsConfiguration));
  withProductionSecrets(
    { jwt: 'j'.repeat(32), deletion: 'short', statistics: 's'.repeat(32) },
    () => assert.throws(assertOperationalSecretsConfiguration)
  );
  withProductionSecrets(
    { jwt: 'j'.repeat(32), deletion: 'd'.repeat(32), statistics: 'd'.repeat(32) },
    () => assert.throws(assertOperationalSecretsConfiguration)
  );
});

test('accepts unique high-entropy-length operational secrets', () => {
  withProductionSecrets(
    { jwt: 'j'.repeat(32), deletion: 'd'.repeat(32), statistics: 's'.repeat(32) },
    () => assert.doesNotThrow(assertOperationalSecretsConfiguration)
  );
});
