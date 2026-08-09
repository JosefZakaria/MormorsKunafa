import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMigrationAdminPasswords } from './migrationAdminPasswords.js';

test('admin migration is opt-in and accepts unique strong passwords', () => {
  assert.equal(parseMigrationAdminPasswords(undefined).size, 0);
  const passwords = parseMigrationAdminPasswords(JSON.stringify({
    ' Admin@Example.se ': 'first-unique-password-123',
    'second@example.se': 'second-unique-password-456',
  }));
  assert.equal(passwords.get('admin@example.se'), 'first-unique-password-123');
  assert.equal(passwords.size, 2);
});

test('rejects malformed, short and reused migration credentials', () => {
  assert.throws(() => parseMigrationAdminPasswords('{not-json'), /JSON object/);
  assert.throws(
    () => parseMigrationAdminPasswords(JSON.stringify({ 'admin@example.se': 'short' })),
    /between 16 and 256 bytes/
  );
  assert.throws(
    () => parseMigrationAdminPasswords(JSON.stringify({
      'one@example.se': 'same-password-value',
      'two@example.se': 'same-password-value',
    })),
    /unique temporary password/
  );
});
