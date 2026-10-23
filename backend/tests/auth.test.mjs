import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';

test('admin authentication fails closed and uses the current account role', async t => {
  const secret = 'isolated-auth-test-secret-at-least-32-characters';
  const users = new Map([
    ['owner', { id: 'owner', role: 'owner', location_id: null }],
    ['location', { id: 'location', role: 'location', location_id: null }],
    ['invalid', { id: 'invalid', role: 'unknown', location_id: null }],
  ]);
  let unavailable = false;
  let lookups = 0;
  const database = createServer((req, res) => {
    lookups++;
    res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url, 'http://localhost');
    assert.equal(url.pathname, '/rest/v1/admin_users');
    if (unavailable) {
      res.statusCode = 400;
      res.end(JSON.stringify({ code: 'XX000', message: 'Isolated test database unavailable' }));
      return;
    }
    const account = users.get(url.searchParams.get('id')?.slice(3));
    res.end(JSON.stringify(account ? [account] : []));
  }).listen(0, '127.0.0.1');
  await once(database, 'listening');
  process.env.SUPABASE_URL = `http://127.0.0.1:${database.address().port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolated-auth-test-only';
  process.env.JWT_SECRET = secret;
  const { signToken, verifyAdminToken, requireAdmin, requireOwner, getRequestAdmin, isJwtConfigured } =
    await import('../dist/middleware/auth.js');
  const { loadAdminScope, loadAdminScopes } = await import('../dist/services/locationScope.js');
  const app = express();
  app.get('/admin', requireAdmin, (req, res) => res.json(getRequestAdmin(req)));
  app.get('/owner', requireAdmin, requireOwner, (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const token = id => signToken({ adminId: id, email: `${id}@example.invalid`, role: 'owner' });
  const ownerToken = token('owner');
  const request = (path = '/admin', bearer = ownerToken) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
  });
  try {
    await t.test('valid owner works; missing, expired and wrong-algorithm tokens are rejected', async () => {
      assert.equal((await request('/owner')).status, 200);
      const before = lookups;
      for (const bearer of ['', 'invalid', jwt.sign({ adminId: 'owner', email: 'owner@example.invalid' }, secret, { expiresIn: -1 }),
        jwt.sign({ adminId: 'owner', email: 'owner@example.invalid' }, secret, { algorithm: 'HS384' }),
        jwt.sign({ adminId: 123, email: 'owner@example.invalid' }, secret)]) {
        assert.equal((await request('/admin', bearer)).status, 401);
      }
      assert.equal(lookups, before);
    });
    await t.test('missing, blank, short and former fallback secrets cannot sign or accept tokens', async () => {
      const formerToken = jwt.sign({ adminId: 'owner', email: 'owner@example.invalid' }, 'dev-secret-change-in-production');
      for (const value of [undefined, '', '   ', 'short', 'dev-secret-change-in-production']) {
        if (value === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = value;
        assert.equal(isJwtConfigured(), false);
        assert.equal(verifyAdminToken(formerToken), null);
        assert.equal(verifyAdminToken(ownerToken), null);
        assert.throws(() => token('owner'), /JWT_SECRET/);
        assert.equal((await request()).status, 503);
      }
      process.env.JWT_SECRET = secret;
    });
    await t.test('removed and invalid-role accounts are denied and omitted from push scopes', async () => {
      for (const id of ['deleted', 'invalid']) {
        assert.equal((await request('/admin', token(id))).status, 401);
        await assert.rejects(loadAdminScope(id));
      }
      const scopes = await loadAdminScopes(['owner', 'deleted', 'invalid']);
      assert.deepEqual([...scopes.keys()], ['owner']);
      users.delete('owner');
      assert.equal((await request()).status, 401);
      users.set('owner', { id: 'owner', role: 'owner', location_id: null });
    });
    await t.test('a stale owner claim cannot override the database role', async () => {
      const response = await request('/admin', token('location'));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).role, 'location');
      assert.equal((await request('/owner', token('location'))).status, 403);
      users.get('owner').role = 'location';
      assert.equal((await request('/owner')).status, 403);
      users.get('owner').role = 'owner';
    });
    await t.test('database failures do not grant access', async () => {
      unavailable = true;
      assert.equal((await request()).status, 503);
    });
  } finally {
    server.close(); database.close();
    server.closeAllConnections(); database.closeAllConnections();
    await Promise.all([once(server, 'close'), once(database, 'close')]);
  }
});
