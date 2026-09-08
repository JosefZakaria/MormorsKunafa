import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
export const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const cacheRoot = path.join(repositoryRoot, '.cache/security-test');
const clusterRoot = path.join(cacheRoot, 'clusters');
const databaseName = 'mk_security_test';

// pg_ctl starts a long-lived child on Windows. Do not leave inherited capture
// pipes open in that server; wait for pg_ctl itself, with no visible window.
function control(executable, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, stdio: 'ignore', windowsHide: true });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Local pg_ctl timed out')); }, 40_000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Local pg_ctl exited with code ${code}`));
    });
  });
}

export function validateTestTarget(host, database) {
  assert.equal(host, '127.0.0.1', 'Database tests only permit IPv4 loopback');
  assert.equal(database, databaseName, 'Database tests only permit mk_security_test');
}

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

/** Starts a new owned cluster. Never attaches to, resets or drops an existing database. */
export async function withTestDatabase(callback) {
  const host = process.env.MK_TEST_DB_HOST ?? '127.0.0.1';
  const database = process.env.MK_TEST_DB_NAME ?? databaseName;
  validateTestTarget(host, database);
  const binaryRoot = process.env.MK_TEST_PG_BIN ?? path.join(cacheRoot, 'postgresql-17.11/pgsql/bin');
  const binary = (name) => path.join(binaryRoot, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^PG/i.test(key)) delete env[key];
  const version = await run(binary('postgres'), ['--version'], { env });
  assert.match(version.stdout, /PostgreSQL\) 17\.11(?:\s|$)/, 'Use the pinned PostgreSQL 17.11 runtime');
  const cluster = path.join(clusterRoot, randomUUID());
  const data = path.join(cluster, 'data');
  const passwordFile = path.join(cluster, 'password');
  const marker = randomUUID();
  const port = await availablePort();
  await mkdir(cluster, { recursive: true });
  await writeFile(path.join(cluster, 'test-cluster-owner'), marker, { flag: 'wx' });
  const password = randomBytes(32).toString('hex');
  await writeFile(passwordFile, password, { flag: 'wx', mode: 0o600 });
  env.PGPASSWORD = password;
  let started = false;
  try {
    await run(binary('initdb'), ['-D', data, '-U', 'mk_test_runner', '-A', 'scram-sha-256',
      '--pwfile', passwordFile, '--encoding=UTF8', '--locale=C'], { env, timeout: 60_000 });
    await rm(passwordFile);
    await control(binary('pg_ctl'), ['-D', data, '-l', path.join(cluster, 'postgres.log'), '-w', '-t', '30',
      '-o', `-h 127.0.0.1 -p ${port}`, 'start'], env);
    started = true;
    const args = ['--no-psqlrc', '--no-password', '--host', host, '--port', String(port),
      '--username', 'mk_test_runner', '--set', 'ON_ERROR_STOP=1', '--no-align', '--tuples-only'];
    const psql = async (extra, db = database) => (await run(binary('psql'),
      [...args, '--dbname', db, ...extra], { env, timeout: 60_000, maxBuffer: 2 * 1024 * 1024 })).stdout.trim();
    await psql(['--command', `CREATE DATABASE ${database}`], 'postgres');
    assert.equal(await psql(['--command', 'SELECT current_database()']), database);
    const sql = (statement) => psql(['--command', statement]);
    const file = (filename) => psql(['--file', path.resolve(filename)]);
    await callback({ sql, file, host, port, database });
  } catch (error) {
    if (!started) {
      const log = await readFile(path.join(cluster, 'postgres.log'), 'utf8').catch(() => 'No server log');
      throw new Error(`Local test database startup failed:\n${log}`, { cause: error });
    }
    throw error;
  } finally {
    const hasServerPid = await access(path.join(data, 'postmaster.pid')).then(() => true, () => false);
    if (started || hasServerPid) await control(binary('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], env);
    // Only delete the exact newly-created directory whose ownership marker we wrote.
    assert.equal(path.dirname(cluster), clusterRoot);
    assert.equal(await readFile(path.join(cluster, 'test-cluster-owner'), 'utf8'), marker);
    await rm(cluster, { recursive: true });
  }
}
