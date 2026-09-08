import assert from 'node:assert/strict';
import path from 'node:path';
import { repositoryRoot, validateTestTarget, withTestDatabase } from './lib/local-test-database.mjs';

for (const host of ['localhost', 'db.example.test', '0.0.0.0', '::1']) {
  assert.throws(() => validateTestTarget(host, 'mk_security_test'));
}
assert.throws(() => validateTestTarget('127.0.0.1', 'postgres'));
assert.throws(() => validateTestTarget('127.0.0.1', 'production'));

await withTestDatabase(async ({ sql, file }) => {
  await file(path.join(repositoryRoot, 'backend/test/fixtures/base-schema.sql'));
  assert.equal(await sql("SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')"), '3');
  assert.equal(await sql("SELECT count(*) FROM public.orders"), '0');
  await sql("BEGIN; INSERT INTO orders(id, order_number, customer_phone) VALUES ('00000000-0000-4000-8000-000000000001', '#0001', '+46700000000'); ROLLBACK;");
  assert.equal(await sql('SELECT count(*) FROM orders'), '0');
  console.log('Verified isolated PostgreSQL 17.11, synthetic schema, roles, transaction rollback and target guards.');
});
