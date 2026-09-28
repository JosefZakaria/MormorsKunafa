import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import { verifyAdminPassword } from './adminPassword.js';

test('verifies a stored admin password without exposing account existence', async () => {
  const hash = await bcrypt.hash('correct horse battery staple', 4);
  assert.equal(await verifyAdminPassword('correct horse battery staple', hash), true);
  assert.equal(await verifyAdminPassword('wrong password', hash), false);
  assert.equal(await verifyAdminPassword('anything', undefined), false);
});

test('fails closed for a corrupt stored hash', async () => {
  assert.equal(await verifyAdminPassword('password', 'not-a-bcrypt-hash'), false);
});
