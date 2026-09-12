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
  assert.equal(legacyPhase1.length, 32, 'Phase 1 includes private defaults, outbound messages and the active push-endpoint guard');
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
  const conflictedPushEndpoint = 'https://fcm.googleapis.com/fcm/send/pre-upgrade-conflict';
  await sql(`INSERT INTO admin_push_subscriptions(id,admin_id,endpoint,p256dh,auth)
    VALUES ('${randomUUID()}','legacy-push-a',${quote(conflictedPushEndpoint)},'key-a','auth-a'),
      ('${randomUUID()}','legacy-push-b',${quote(conflictedPushEndpoint)},'key-b','auth-b')`);
  const location = '2f1a9c4e-6b7d-4e8f-a901-b2c3d4e5f602';
  const legacyId = randomUUID();
  await sql(`INSERT INTO orders(id, order_number, customer_phone, location_id, stripe_checkout_session_id, total_ore)
    VALUES ('${legacyId}', '#9998', '+46700000000', '${location}', 'cs_test_before_upgrade', 1234);
    INSERT INTO order_items(id, order_id, product_name_snapshot, quantity, price_ore)
    VALUES ('${randomUUID()}', '${legacyId}', 'Pre-upgrade synthetic cake', 1, 1234)`);
  const ownershipMigration = '2026-09-08-stripe-event-ownership.sql';
  const pushOwnershipMigration = '20260912193000_single_active_push_endpoint.sql';
  await apply(legacyPhase1.filter(name =>
    name !== ownershipMigration && name !== pushOwnershipMigration));
  await sql(`INSERT INTO payment_provider_events(provider,event_id,event_type,livemode,status,attempts,lease_expires_at,outcome)
    VALUES ('stripe','evt_legacy_first','test',false,'processing',1,now()+interval '5 minutes',NULL),
    ('stripe','evt_legacy_retry','test',false,'processing',2,now()-interval '1 second',NULL),
    ('stripe','evt_legacy_done','test',false,'processed',1,NULL,'preserved')`);
  await apply([ownershipMigration]);
  await file(path.join(repositoryRoot,'backend/src/db/verification/verify-security-metadata.sql'), {
    expected_accounting_profile: 'secured-ledgers',
  });
  await file(path.join(repositoryRoot,'backend/src/db/verification/verify-restored-database.sql'), {
    expected_accounting_profile: 'secured-ledgers',
  });
  await apply([pushOwnershipMigration]);
  assert.equal(await sql(`SELECT count(*) FROM admin_push_subscriptions
    WHERE endpoint=${quote(conflictedPushEndpoint)} AND disabled_at IS NULL`),'0',
    'An ambiguous pre-upgrade endpoint must be disabled for every account');
  assert.equal(await sql(`SELECT count(*) FROM admin_push_subscriptions
    WHERE endpoint=${quote(conflictedPushEndpoint)} AND disabled_at IS NOT NULL`),'2');
  assert.equal(await sql(`SELECT count(*) FROM pg_indexes
    WHERE schemaname='public' AND indexname='admin_push_subscriptions_active_endpoint_uq'`),'1');
  await sql(`INSERT INTO admin_users(id,email,password_hash)
    VALUES ('legacy-push-a','legacy-push-a@example.test','synthetic'),
      ('legacy-push-b','legacy-push-b@example.test','synthetic'),
      ('legacy-push-final','legacy-push-final@example.test','synthetic')`);
  const registerPush = (adminId, tokenVersion = 1) => `SET ROLE service_role;
    SELECT admin_id FROM public.register_admin_push_subscription(
      ${quote(adminId)},${tokenVersion},${quote(conflictedPushEndpoint)},'new-p256dh','new-auth',NULL,'Synthetic tablet')`;
  const concurrentPushRegistrations = await Promise.all([
    sql(registerPush('legacy-push-a')),
    sql(registerPush('legacy-push-b')),
  ]);
  assert.deepEqual(new Set(concurrentPushRegistrations),new Set(['legacy-push-a','legacy-push-b']));
  assert.equal(await sql(`SELECT count(*) FROM admin_push_subscriptions
    WHERE endpoint=${quote(conflictedPushEndpoint)} AND disabled_at IS NULL`),'1',
    'Concurrent registration must leave exactly one active owner');
  assert.equal(await sql(registerPush('legacy-push-final')),'legacy-push-final');
  assert.equal(await sql(`SELECT admin_id FROM admin_push_subscriptions
    WHERE endpoint=${quote(conflictedPushEndpoint)} AND disabled_at IS NULL`),'legacy-push-final',
    'A later registration must atomically transfer the endpoint');
  await sql("UPDATE admin_users SET token_version=2 WHERE id='legacy-push-final'");
  await assert.rejects(sql(registerPush('legacy-push-final', 1)), /stale admin session/);
  assert.equal(await sql(`SELECT admin_id FROM admin_push_subscriptions
    WHERE endpoint=${quote(conflictedPushEndpoint)} AND disabled_at IS NULL`),'legacy-push-final',
    'A stale session must not mutate the active endpoint owner');
  await file(path.join(repositoryRoot,'backend/test/fixtures/stripe-event-ownership.sql'));
  await file(path.join(repositoryRoot,'backend/test/fixtures/online-cancellation-boundary.sql'));
  await file(path.join(repositoryRoot,'backend/src/db/verification/verify-restored-database.sql'), {
    expected_accounting_profile: 'secured-ledgers',
  });
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

  // Queue fairness is required during Phase 3, before the Phase 4 constraints.
  await file(path.join(repositoryRoot,'backend/test/fixtures/checkout-retention.sql'));

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
  const privateDefaults = '2026-09-11-private-function-defaults.sql';
  for (const name of order) if (name !== privateDefaults) await file(path.join(migrations, name));
  await sql('CREATE FUNCTION public.synthetic_default_acl_probe() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$');
  assert.equal(await sql('SET ROLE anon; SELECT public.synthetic_default_acl_probe()'), '1',
    'The historical schema-scoped REVOKE cannot cancel the global PUBLIC function default');
  await sql('DROP FUNCTION public.synthetic_default_acl_probe()');
  await file(path.join(migrations, privateDefaults));
  await file(path.join(repositoryRoot,'backend/test/fixtures/outbound-message-jobs.sql'));
  for (const helper of ['reject_security_audit_mutation','protect_order_financial_history']) {
    for (const role of ['anon','authenticated']) {
      assert.equal(await sql(`SELECT has_function_privilege('${role}','public.${helper}()','EXECUTE')`),'f');
    }
  }
  await sql('CREATE FUNCTION public.synthetic_default_acl_probe() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$');
  for (const role of ['anon','authenticated','service_role']) {
    await assert.rejects(sql(`SET ROLE ${role}; SELECT public.synthetic_default_acl_probe()`));
  }
  await sql('GRANT EXECUTE ON FUNCTION public.synthetic_default_acl_probe() TO service_role');
  assert.equal(await sql('SET ROLE service_role; SELECT public.synthetic_default_acl_probe()'), '1');
  await sql('DROP FUNCTION public.synthetic_default_acl_probe(); CREATE ROLE synthetic_metadata_reader NOLOGIN');
  const metadataSql = await readFile(path.join(repositoryRoot,
    'backend/src/db/verification/verify-security-metadata.sql'),'utf8');
  assert.equal(await sql("SELECT has_table_privilege('synthetic_metadata_reader','public.orders','SELECT')"), 'f');
  assert.match(await sql('SET ROLE synthetic_metadata_reader;\n'+metadataSql), /security_metadata_sha256=[a-f0-9]{64}/,
    'The metadata gate must not need SELECT on order/customer/auth/Storage tables');
  await sql('GRANT EXECUTE ON FUNCTION public.create_order_atomic(jsonb,jsonb) TO anon');
  await assert.rejects(sql('SET ROLE synthetic_metadata_reader;\n'+metadataSql));
  await sql('REVOKE EXECUTE ON FUNCTION public.create_order_atomic(jsonb,jsonb) FROM anon');
  await sql('ALTER TABLE public.locations NO FORCE ROW LEVEL SECURITY');
  await assert.rejects(sql('SET ROLE synthetic_metadata_reader;\n'+metadataSql));
  await sql('ALTER TABLE public.locations FORCE ROW LEVEL SECURITY');

  // A column-only grant can mutate a refund even while has_table_privilege is
  // false. The acceptance gate must reject it and the source fingerprint must
  // record it. Legacy mode is used only to inspect the otherwise rejected hash.
  const metadataAsReader = (profile = 'secured-ledgers') => sql(
    `SET ROLE synthetic_metadata_reader;\n\\set expected_accounting_profile ${profile}\n`+metadataSql,
  );
  const fingerprint = async (profile = 'secured-ledgers') => (await metadataAsReader(profile))
    .match(/security_metadata_sha256=[a-f0-9]{64}/)[0];
  const cleanColumnFingerprint = await fingerprint('legacy-core');
  const columnOrderId=randomUUID(), columnItemId=randomUUID(), columnRefundId=randomUUID();
  await sql(`INSERT INTO public.orders(id,order_number,total_ore,customer_phone)
    VALUES ('${columnOrderId}','#column-acl-probe',100,'synthetic');
    INSERT INTO public.order_items(id,order_id,product_name_snapshot,quantity,price_ore)
    VALUES ('${columnItemId}','${columnOrderId}','Synthetic column ACL probe',1,100);
    INSERT INTO public.order_refunds(id,order_id,provider,amount_ore,idempotency_key,selection_json,requested_by_admin_id)
    VALUES ('${columnRefundId}','${columnOrderId}','stripe',25,'synthetic-column-acl-key','[]','synthetic-admin')`);
  for (const table of ['order_refunds','order_refund_items','duplicate_stripe_refunds']) {
    for (const privilege of ['INSERT','UPDATE']) {
      await sql(`GRANT ${privilege}(amount_ore) ON public.${table} TO service_role`);
      assert.equal(await sql(`SELECT has_table_privilege('service_role','public.${table}','${privilege}')`),'f');
      assert.equal(await sql(`SELECT has_any_column_privilege('service_role','public.${table}','${privilege}')`),'t');
      if (table==='order_refunds' && privilege==='UPDATE') {
        assert.equal(await sql(`SET ROLE service_role; UPDATE public.order_refunds SET amount_ore=30
          WHERE id='${columnRefundId}' RETURNING amount_ore`),'30');
      }
      await assert.rejects(metadataAsReader(), /Refund ledger allows direct service-role mutation/);
      assert.notEqual(await fingerprint('legacy-core'),cleanColumnFingerprint);
      await sql(`REVOKE ${privilege}(amount_ore) ON public.${table} FROM service_role`);
    }
  }
  await assert.rejects(sql(`SET ROLE service_role; UPDATE public.order_refunds SET amount_ore=35
    WHERE id='${columnRefundId}'`));
  for (const role of ['anon','authenticated']) {
    await sql(`GRANT SELECT(customer_email) ON public.orders TO ${role}`);
    assert.equal(await sql(`SELECT has_table_privilege('${role}','public.orders','SELECT')`),'f');
    await assert.rejects(metadataAsReader(), /Unsafe application table privileges/);
    assert.notEqual(await fingerprint('legacy-core'),cleanColumnFingerprint);
    await sql(`REVOKE SELECT(customer_email) ON public.orders FROM ${role}`);
  }
  // Also retain a reviewed operator's column privilege and its grant option in
  // the fingerprint; neither is a forbidden anon/refund grant above.
  await sql('CREATE ROLE synthetic_column_reader NOLOGIN; GRANT SELECT(amount_ore) ON public.order_refunds TO synthetic_column_reader');
  const restrictedColumnFingerprint=await fingerprint();
  assert.notEqual(restrictedColumnFingerprint,cleanColumnFingerprint);
  await sql('GRANT SELECT(amount_ore) ON public.order_refunds TO synthetic_column_reader WITH GRANT OPTION');
  assert.notEqual(await fingerprint(),restrictedColumnFingerprint);
  await sql('REVOKE SELECT(amount_ore) ON public.order_refunds FROM synthetic_column_reader');
  assert.equal(await fingerprint(),cleanColumnFingerprint,'Revoked column ACLs must normalize back to the unchanged metadata');
  await sql(`DELETE FROM public.order_refunds WHERE id='${columnRefundId}'; DELETE FROM public.orders WHERE id='${columnOrderId}'`);
  console.log('Verified column-only refund mutation is rejected by the metadata gate, client column grants are denied, and column ACL/grant-option fingerprints are preserved.');
  await file(path.join(repositoryRoot,'backend/src/db/verification/verify-restored-database.sql'), {
    expected_accounting_profile: 'secured-ledgers',
  });
  const inconsistentReceiptId = randomUUID();
  await sql(`INSERT INTO orders(
      id, order_number, customer_phone, total_ore, receipt_vat_rate_percent, receipt_vat_ore
    ) VALUES ('${inconsistentReceiptId}', '#receipt-check', '+46700000000', 100, 6, 1);
    INSERT INTO order_items(id, order_id, product_name_snapshot, quantity, price_ore)
    VALUES ('${randomUUID()}', '${inconsistentReceiptId}', 'Receipt verifier probe', 1, 100)`);
  await assert.rejects(file(
    path.join(repositoryRoot,'backend/src/db/verification/verify-restored-database.sql'),
    { expected_accounting_profile: 'secured-ledgers' },
  ));
  await sql(`DELETE FROM orders WHERE id='${inconsistentReceiptId}'`);
  assert.equal(await sql(`SELECT count(*) FROM pg_trigger WHERE tgrelid='orders'::regclass
    AND tgname='assign_order_number_from_sequence' AND NOT tgisinternal AND tgenabled <> 'D'`), '1');
  assert.equal(await sql(`SELECT count(*) FROM pg_constraint WHERE conrelid='orders'::regclass
    AND conname='orders_total_positive_ck'`), '1');
  console.log('Verified the separate fresh-install migration manifest reaches the same guarded allocator and final constraints.');
});
