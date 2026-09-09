import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { repositoryRoot, validateTestTarget, withTestDatabase } from './lib/local-test-database.mjs';
import { verifyRestoreIntegrityChecks } from './lib/test-restore-integrity.mjs';

for (const host of ['localhost', 'db.example.test', '0.0.0.0', '::1']) {
  assert.throws(() => validateTestTarget(host, 'mk_security_test'));
}
assert.throws(() => validateTestTarget('127.0.0.1', 'postgres'));
assert.throws(() => validateTestTarget('127.0.0.1', 'production'));

await withTestDatabase(async ({ sql, file }) => {
  await file(path.join(repositoryRoot, 'backend/test/fixtures/base-schema.sql'));
  await verifyRestoreIntegrityChecks({sql,file});
  assert.equal(await sql("SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')"), '3');
  assert.equal(await sql("SELECT count(*) FROM public.orders"), '0');
  await sql("BEGIN; INSERT INTO orders(id, order_number, customer_phone) VALUES ('00000000-0000-4000-8000-000000000001', '#0001', '+46700000000'); ROLLBACK;");
  assert.equal(await sql('SELECT count(*) FROM orders'), '0');
  const migrations = path.join(repositoryRoot, 'backend/src/db/migrations');
  const order = JSON.parse(await readFile(path.join(migrations, 'migration-order.json'), 'utf8'));
  const legacyPlan = JSON.parse(await readFile(path.join(migrations, 'legacy-transition-order.json'), 'utf8'));
  const legacyPhase1 = legacyPlan.phase1DatabaseBridge;
  const legacyFinal = legacyPlan.phase4AfterLegacyDrain;
  assert.deepEqual([...order].sort(), (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort());
  assert(Array.isArray(legacyPhase1) && Array.isArray(legacyFinal));
  assert(!legacyPhase1.includes('2026-08-19-atomic-order-creation.sql'));
  assert(!legacyPhase1.includes('2026-09-08-checkout-rollout.sql'));
  assert.deepEqual(legacyFinal, ['2026-09-09-checkout-contract-finalization.sql']);
  for (const name of [...legacyPhase1, ...legacyFinal]) assert(order.includes(name), name);
  await sql("CREATE TABLE test_migrations(name text PRIMARY KEY, checksum text NOT NULL)");
  // Reconstruct main first, including an order whose payment started before upgrade.
  const mainNames = ['2026-06-06-admin-pwa-notifications.sql', '2026-08-15-order-type-enabled.sql',
    '2026-08-19-menu-sort-and-hero.sql', '2026-08-19-site-media-bucket.sql',
    '2026-08-27-product-hidden.sql', '2026-08-27-product-variant-prices.sql',
    '2026-08-28-locations.sql', '2026-08-30-mollevangen-address.sql', '2026-08-30-product-location-stock.sql'];
  const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
  async function apply(names) {
    let applied = 0;
    for (const name of names) {
      const checksum = createHash('sha256').update(await readFile(path.join(migrations, name))).digest('hex');
      const existing = await sql(`SELECT checksum FROM test_migrations WHERE name=${quote(name)}`);
      if (existing) { assert.equal(existing, checksum); continue; }
      await file(path.join(migrations, name));
      await sql(`INSERT INTO test_migrations VALUES (${quote(name)}, ${quote(checksum)})`);
      applied++;
    }
    return applied;
  }
  await apply(mainNames);
  const location = '2f1a9c4e-6b7d-4e8f-a901-b2c3d4e5f602';
  const legacyId = randomUUID();
  await sql(`INSERT INTO orders(id, order_number, customer_phone, location_id, stripe_checkout_session_id)
    VALUES ('${legacyId}', '#9998', '+46700000000', '${location}', 'cs_test_before_upgrade')`);
  const ownershipMigration = '2026-09-08-stripe-event-ownership.sql';
  await apply(legacyPhase1.filter(name => name !== ownershipMigration));
  await sql(`INSERT INTO payment_provider_events(provider,event_id,event_type,livemode,status,attempts,lease_expires_at,outcome)
    VALUES ('stripe','evt_legacy_first','test',false,'processing',1,now()+interval '5 minutes',NULL),
    ('stripe','evt_legacy_retry','test',false,'processing',2,now()-interval '1 second',NULL),
    ('stripe','evt_legacy_done','test',false,'processed',1,NULL,'preserved')`);
  await apply(legacyPhase1);
  await file(path.join(repositoryRoot,'backend/test/fixtures/stripe-event-ownership.sql'));
  await file(path.join(repositoryRoot,'backend/test/fixtures/online-cancellation-boundary.sql'));
  assert.equal(await sql(`SELECT order_number || ':' || stripe_checkout_session_id || ':' || location_id::text
    FROM orders WHERE id='${legacyId}'`), '#9998:cs_test_before_upgrade:' + location);
  assert.equal(await apply(legacyPhase1), 0, 'already applied Phase 1 migrations must not run again');
  const createOrder = (id, quantity = 1) => `SET ROLE service_role; SELECT order_number FROM create_order_atomic(
    ${quote(JSON.stringify({ id, status: 'ny', order_type: 'takeaway', payment_method: 'card', payment_status: 'pending',
      default_preparation_time_minutes: 30, customer_phone: '+46700000000', location_id: location }))}::jsonb,
    ${quote(JSON.stringify([{id: randomUUID(), product_id: null, product_name_snapshot: 'Synthetic cake', quantity, price_ore: 1234}]))}::jsonb)`;
  const first = randomUUID();
  assert.equal(await sql(createOrder(first)), '#9999');
  assert.equal(await sql(`SELECT location_id::text || ':' || total_ore::text FROM orders WHERE id='${first}'`), location + ':1234');
  const numbers = await Promise.all(Array.from({length: 12}, () => sql(createOrder(randomUUID()))));
  assert.equal(new Set(numbers).size, 12);
  assert(numbers.includes('#10000'));
  // Reproduce the locked-main race exactly: MAX is read before the atomic RPC
  // consumes that candidate. The legacy INSERT supplies the stale value and an
  // explicit zero total, but the shared trigger assigns the next unique number.
  const legacyCandidateValue = Number(await sql(`SELECT COALESCE(
    max(substring(order_number FROM '^#([0-9]+)$')::bigint), 0) + 1 FROM orders`));
  const legacyCandidate = `#${String(legacyCandidateValue).padStart(4, '0')}`;
  assert.equal(await sql(createOrder(randomUUID())), legacyCandidate);
  const legacyWriterId = randomUUID();
  const allocatedLegacyNumber = await sql(`INSERT INTO orders(
      id,order_number,total_ore,customer_phone,location_id
    ) VALUES ('${legacyWriterId}',${quote(legacyCandidate)},0,'+46700000000','${location}')
    RETURNING order_number`);
  assert.notEqual(allocatedLegacyNumber, legacyCandidate);
  assert.equal(await sql(`SELECT total_ore FROM orders WHERE id='${legacyWriterId}'`), '0');
  await sql(`INSERT INTO order_items(id,order_id,product_name_snapshot,quantity,price_ore)
    VALUES ('${randomUUID()}','${legacyWriterId}','Legacy synthetic cake',1,1234)`);
  await sql(`UPDATE orders SET total_ore=1234 WHERE id='${legacyWriterId}'`);

  const staleCandidate = allocatedLegacyNumber;
  const mixedNumbers = await Promise.all([
    ...Array.from({length: 6}, () => sql(createOrder(randomUUID()))),
    ...Array.from({length: 6}, () => sql(`INSERT INTO orders(id,order_number,total_ore,customer_phone,location_id)
      VALUES ('${randomUUID()}',${quote(staleCandidate)},1234,'+46700000000','${location}') RETURNING order_number`)),
  ]);
  assert.equal(new Set(mixedNumbers).size, mixedNumbers.length);

  // A legacy crash after its parent insert remains visible for reconciliation.
  const partialLegacyId = randomUUID();
  await sql(`INSERT INTO orders(id,order_number,total_ore,customer_phone,location_id)
    VALUES ('${partialLegacyId}','#0001',0,'+46700000000','${location}')`);
  assert.equal(await sql(`SELECT total_ore FROM orders WHERE id='${partialLegacyId}'`), '0');

  await apply(legacyFinal);
  assert.equal(await sql(`SELECT total_ore FROM orders WHERE id='${partialLegacyId}'`), '0');
  await assert.rejects(sql(`INSERT INTO orders(id,order_number,total_ore,customer_phone,location_id)
    VALUES ('${randomUUID()}','#0001',0,'+46700000000','${location}')`));
  const invalidId = randomUUID();
  await assert.rejects(sql(createOrder(invalidId, 51)));
  assert.equal(await sql(`SELECT count(*) FROM orders WHERE id='${invalidId}'`), '0');
  assert.equal(await sql(`SELECT convalidated FROM pg_constraint
    WHERE conrelid='orders'::regclass AND conname='orders_total_positive_ck'`), 'f');
  await sql("SELECT setval('order_number_seq', 10030, true)");
  // Explicit staging-only repeat proves finalization is idempotent and never
  // rewinds a reserved number.
  await file(path.join(migrations, legacyFinal[0]));
  assert.equal(await sql(createOrder(randomUUID())), '#10031');
  assert.equal(await apply([...legacyPhase1, ...legacyFinal]), 0);
  await file(path.join(repositoryRoot,'backend/test/fixtures/checkout-retention.sql'));
  for (const role of ['anon', 'authenticated']) {
    for (const table of ['orders', 'order_items', 'admin_users', 'locations', 'product_location_stock']) {
      await assert.rejects(sql(`SET ROLE ${role}; SELECT * FROM ${table}`));
    }
    assert.equal(await sql(`SELECT has_function_privilege('${role}', 'create_order_atomic(jsonb,jsonb)', 'execute')`), 'f');
  }
  console.log('Verified legacy phased upgrade, immutable ledger, preserved partial/payment rows, shared MAX/RPC allocation, delayed constraints, reapplication and role/RPC denial.');
});

// The ordinary manifest remains the empty/fresh-install track. It may use the
// original atomic and rollout migrations because no legacy writer is live.
await withTestDatabase(async ({ sql, file }) => {
  await file(path.join(repositoryRoot, 'backend/test/fixtures/base-schema.sql'));
  const migrations = path.join(repositoryRoot, 'backend/src/db/migrations');
  const order = JSON.parse(await readFile(path.join(migrations, 'migration-order.json'), 'utf8'));
  for (const name of order) await file(path.join(migrations, name));
  assert.equal(await sql(`SELECT count(*) FROM pg_trigger WHERE tgrelid='orders'::regclass
    AND tgname='assign_order_number_from_sequence' AND NOT tgisinternal AND tgenabled <> 'D'`), '1');
  assert.equal(await sql(`SELECT count(*) FROM pg_constraint WHERE conrelid='orders'::regclass
    AND conname='orders_total_positive_ck'`), '1');
  console.log('Verified the separate fresh-install migration manifest reaches the same guarded allocator and final constraints.');
});
