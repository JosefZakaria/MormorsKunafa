import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { repositoryRoot, withTestDatabase } from './lib/local-test-database.mjs';

// The operator scripts use Windows PowerShell. Every database below is a new
// owned loopback cluster; this test never accepts a hosted connection or data.
assert.equal(process.platform, 'win32', 'Run the operator restore regression on Windows');
const run = promisify(execFile);
const binaryRoot = path.resolve(process.env.MK_TEST_PG_BIN
  ?? path.join(repositoryRoot, '.cache/security-test/postgresql-17.11/pgsql/bin'));
const powershell = path.join(process.env.SystemRoot ?? 'C:/Windows',
  'System32/WindowsPowerShell/v1.0/powershell.exe');
const migrations = path.join(repositoryRoot, 'backend/src/db/migrations');
const fixture = path.join(repositoryRoot, 'backend/test/fixtures/base-schema.sql');
const orderId = '00000000-0000-4000-8000-000000000001';

async function command(executable, args, env) {
  try {
    return await run(executable, args, {
      cwd: repositoryRoot, env, windowsHide: true, timeout: 90_000, maxBuffer: 512 * 1024,
    });
  } catch (failure) {
    // Do not log command environments, archive contents or a child-process dump.
    const error = new Error(`${path.basename(executable)} failed (${failure.code ?? 'unknown exit'})`);
    error.stderr = failure.stderr ?? '';
    throw error;
  }
}

function operatorEnvironment(source, target, sourcePassword, targetPassword) {
  assert.equal(source.host, '127.0.0.1');
  assert.equal(target.host, '127.0.0.1');
  assert.equal(source.database, 'mk_security_test');
  assert.equal(target.database, 'mk_security_test');
  assert.notEqual(source.port, target.port, 'Source and target must be independent live clusters');
  const env = { ...process.env };
  const savedPath = Object.entries(env).find(([name]) => /^path$/i.test(name))?.[1] ?? '';
  for (const name of Object.keys(env)) {
    if (/^(PG|RESTORE_PG)/i.test(name) || /^(path|PSModulePath)$/i.test(name)) delete env[name];
  }
  return Object.assign(env, {
    Path: binaryRoot + path.delimiter + savedPath,
    PGHOST: '127.0.0.1', PGPORT: String(source.port), PGDATABASE: source.database,
    PGUSER: 'mk_test_runner', PGPASSWORD: sourcePassword, PGSSLMODE: 'disable',
    // Different host labels satisfy the operator's source-host guard. Different
    // live ports and the owned-cluster helper establish actual local isolation.
    RESTORE_PGHOST: 'localhost', RESTORE_PGPORT: String(target.port),
    RESTORE_PGDATABASE: target.database, RESTORE_PGUSER: 'mk_test_runner',
    RESTORE_PGPASSWORD: targetPassword, RESTORE_PGSSLMODE: 'disable',
  });
}

const summarySql = `SELECT json_build_object(
  'orders',(SELECT count(*) FROM public.orders),
  'items',(SELECT count(*) FROM public.order_items),
  'paidGrossOre',(SELECT sum(total_ore) FROM public.orders WHERE payment_status='paid'),
  'audit',(SELECT count(*) FROM public.security_audit_log),
  'storage',(SELECT count(*) FROM storage.buckets)
)::text`;
const expectedSummary = { orders: 1, items: 2, paidGrossOre: 100, audit: 1, storage: 1 };
const columnSql = `SELECT json_agg(json_build_array(acl.privilege_type,acl.is_grantable)
  ORDER BY acl.privilege_type,acl.is_grantable)::text
  FROM pg_attribute attribute CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
  WHERE attribute.attrelid='public.order_refunds'::regclass AND attribute.attname='amount_ore'
    AND acl.grantee='service_role'::regrole`;

await withTestDatabase(async (source) => {
  await source.file(fixture);
  for (const name of JSON.parse(await readFile(path.join(migrations, 'migration-order.json'), 'utf8'))) {
    await source.file(path.join(migrations, name));
  }
  await source.sql(`INSERT INTO public.orders(id,order_number,total_ore,customer_phone)
    VALUES ('${orderId}','#0001',100,'synthetic');
    INSERT INTO public.order_items(id,order_id,product_name_snapshot,quantity,price_ore)
    VALUES ('00000000-0000-4000-8000-000000000002','${orderId}','Synthetic',1,100);
    INSERT INTO public.order_items(id,order_id,product_name_snapshot,quantity,price_ore) VALUES ('00000000-0000-4000-8000-000000000004','${orderId}','Leveransavgift',1,0);
    SELECT public.mark_order_paid_with_audit('${orderId}',now(),'00000000-0000-4000-8000-000000000003');
    GRANT SELECT(amount_ore) ON public.order_refunds TO service_role WITH GRANT OPTION`);

  await withTestDatabase(async (target) => {
    await target.file(fixture);
    await target.sql("INSERT INTO storage.buckets(id,name) VALUES ('synthetic-target-sentinel','synthetic-target-sentinel')");
    const sourcePassword = randomBytes(32).toString('hex');
    const targetPassword = randomBytes(32).toString('hex');
    // Only these newly created local roles are changed. Passwords stay in child
    // environments, never command arguments or test output.
    await source.sql(`ALTER ROLE mk_test_runner PASSWORD '${sourcePassword}'`);
    await target.sql(`ALTER ROLE mk_test_runner PASSWORD '${targetPassword}'`);
    const env = operatorEnvironment(source, target, sourcePassword, targetPassword);
    const targetEnv = { ...env, PGHOST: 'localhost', PGPORT: String(target.port), PGPASSWORD: targetPassword };
    const query = async (statement, connection) => (await command(path.join(binaryRoot, 'psql.exe'),
      ['--quiet', '--no-psqlrc', '--no-password', '--set', 'ON_ERROR_STOP=1', '--no-align', '--tuples-only',
        '--command', statement], connection)).stdout.trim();
    const temp = await mkdtemp(path.join(os.tmpdir(), 'mk-backup-restore-test-'));
    try {
      assert.deepEqual(JSON.parse(await query(summarySql, env)), expectedSummary);
      assert.deepEqual(JSON.parse(await query(columnSql, env)), [['SELECT', true]]);
      // The migration creates this bucket in the synthetic source fixture.
      assert.equal(await query('SELECT id FROM storage.buckets', env), 'site-media');
      const backup = await command(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
        'scripts/New-SupabaseSafetyBackup.ps1', '-DestinationDirectory', temp,
        '-AcknowledgeRestrictedDestination'], env);
      assert.match(backup.stdout, /archive_catalog=verified/);
      const files = await readdir(temp);
      const archives = files.filter((name) => name.endsWith('.dump'));
      const manifests = files.filter((name) => name.endsWith('.manifest.json'));
      assert.equal(archives.length, 1);
      assert.equal(manifests.length, 1);
      const archivePath = path.join(temp, archives[0]);
      const manifestPath = path.join(temp, manifests[0]);
      const manifest = JSON.parse((await readFile(manifestPath, 'utf8')).replace(/^\uFEFF/, ''));
      assert.equal(manifest.formatVersion, 3);
      assert.equal(manifest.archiveScope, 'public-schema-only');
      assert.equal(manifest.privilegesIncluded, true);
      assert.equal(manifest.accountingProfile, 'secured-ledgers');
      assert.match(manifest.securityMetadataSha256, /^[a-f0-9]{64}$/);
      const restored = await command(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
        "& './scripts/Test-SupabaseBackupRestore.ps1' -ArchivePath $env:MK_PROBE_ARCHIVE -ManifestPath $env:MK_PROBE_MANIFEST -ExpectedDisposableDatabase mk_security_test -ExpectedAccountingProfile secured-ledgers -ConfirmDisposableTarget -Confirm:$false"],
      { ...env, MK_PROBE_ARCHIVE: archivePath, MK_PROBE_MANIFEST: manifestPath });
      assert.match(restored.stdout, /restore=verified_against_source_profile/);
      assert.match(restored.stdout, /security_metadata=verified_against_source_secured-ledgers/);
      assert.match(restored.stdout, /managed_schemas=excluded/);
      assert.deepEqual(JSON.parse(await query(summarySql, targetEnv)), expectedSummary);
      assert.deepEqual(JSON.parse(await query(columnSql, targetEnv)), [['SELECT', true]]);
      assert.equal(await query('SELECT id FROM storage.buckets', targetEnv), 'synthetic-target-sentinel');
      assert.equal(await query('SET ROLE service_role; SELECT count(*) FROM public.orders', targetEnv), '1');
      for (const statement of ['SET ROLE anon; SELECT * FROM public.orders',
        'SET ROLE service_role; UPDATE public.order_refunds SET amount_ore=0']) {
        await assert.rejects(query(statement, targetEnv), (error) => /permission denied/.test(error.stderr));
      }
      const metadata = await command(path.join(binaryRoot, 'psql.exe'), ['--no-psqlrc', '--no-password',
        '--set', 'ON_ERROR_STOP=1', '--file', 'backend/src/db/verification/verify-security-metadata.sql'], targetEnv);
      assert.equal(metadata.stdout.match(/security_metadata_sha256=([a-f0-9]{64})/)?.[1],
        manifest.securityMetadataSha256);
      console.log('Verified real independent A/B restore: source/target orders=1, items=2, paidGrossOre=100, audit=1, Storage=1; target Storage sentinel, column SELECT/grant option, ACL and metadata retained.');
    } finally {
      assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
      assert.ok(path.basename(temp).startsWith('mk-backup-restore-test-'));
      await rm(temp, { recursive: true });
    }
  });
});
