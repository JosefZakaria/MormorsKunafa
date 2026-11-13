import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { serveSessionTable, sessions } from './helpers/admin-session.mjs';

test('cookie sessions restore safely, enforce CSRF and revoke across instances without changing accounts', async t => {
  const owner = { id: 'owner', email: 'owner@example.invalid', display_name: 'Test owner', role: 'owner', location_id: null,
    password_hash: await bcrypt.hash('test-password', 4) };
  let unavailable = false, writes = 0;
  const database = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Content-Type', 'application/json');
    if (unavailable && url.pathname.endsWith('admin_sessions')) {
      res.statusCode = 503; res.end('{"message":"Isolated session database failure"}'); return;
    }
    if (await serveSessionTable(req, res, url)) return;
    if (url.pathname.endsWith('/rpc/consume_api_rate_limits')) { req.resume(); res.end('0'); return; }
    assert.equal(url.pathname, '/rest/v1/admin_users');
    if (req.method !== 'GET') { writes++; req.resume(); }
    res.end(JSON.stringify([owner]));
  }).listen(0, '127.0.0.1');
  await once(database, 'listening');
  Object.assign(process.env, { SUPABASE_URL: `http://127.0.0.1:${database.address().port}`,
    SUPABASE_SERVICE_ROLE_KEY: 'isolated-sessions', JWT_SECRET: 'isolated-sessions-secret-at-least-32-characters', NODE_ENV: 'production' });
  const { default: router } = await import('../dist/routes/admin.js');
  const servers = [0, 1].map(() => {
    const app = express(); app.use(express.json()); app.use('/admin', router); return app.listen(0, '127.0.0.1');
  });
  await Promise.all(servers.map(server => once(server, 'listening')));
  const request = (path, { method = 'GET', headers = {}, body, instance = 0, ...rest } = {}) => fetch(
    `http://127.0.0.1:${servers[instance].address().port}/admin${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...rest,
    });
  const login = () => request('/login', { method: 'POST', headers: { Origin: 'https://mormorskunafa.se', 'X-Admin-Request': '1' },
    body: { email: owner.email, password: 'test-password' } });
  let cookie, csrf, hash;
  try {
    await t.test('login sets a host-only HttpOnly Secure Lax cookie and stores only a hash with 16h expiry', async () => {
      const response = await login();
      assert.equal(response.status, 200);
      const setCookie = response.headers.get('set-cookie');
      assert.match(setCookie, /^__Host-mk_admin=[a-f0-9]{64};/);
      for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=57600']) assert.ok(setCookie.includes(flag));
      assert.equal(setCookie.includes('Domain='), false);
      cookie = setCookie.split(';')[0];
      const raw = cookie.split('=')[1];
      const result = await response.json(); csrf = result.csrfToken;
      assert.equal(result.admin.name, 'Test owner');
      assert.equal(result.token, undefined);
      assert.equal(JSON.stringify(result).includes(raw), false);
      hash = createHash('sha256').update(raw).digest('hex');
      assert.equal(sessions.has(hash), true);
      assert.ok(Math.abs(new Date(sessions.get(hash).expires_at).getTime() - Date.now() - 16 * 3600000) < 5000);
      assert.equal(JSON.stringify([...sessions.values()]).includes(raw), false);
    });
    await t.test('reload restores the profile and CSRF token on either instance', async () => {
      const result = await request('/session', { headers: { Cookie: cookie }, instance: 1 });
      assert.equal(result.status, 200);
      assert.equal(result.headers.get('cache-control'), 'no-store');
      const data = await result.json(); assert.equal(data.csrfToken, csrf); assert.equal(data.admin.id, owner.id);
      assert.equal(data.admin.session, undefined);
      const legacy = jwt.sign({ adminId: owner.id, email: owner.email }, process.env.JWT_SECRET);
      assert.equal((await request(`/events?token=${legacy}`)).status, 401);
      assert.equal((await request('/session', { headers: { Authorization: `Bearer ${legacy}` } })).status, 401);
    });
    await t.test('cross-site login, form login and missing, forged or other-session CSRF cannot mutate', async () => {
      const before = writes;
      for (const headers of [{}, { 'X-Admin-Request': '1', Origin: 'https://attacker.invalid' },
        { 'X-Admin-Request': '1', 'Sec-Fetch-Site': 'cross-site' }]) {
        assert.equal((await request('/login', { method: 'POST', headers, body: { email: owner.email, password: 'test-password' } })).status, 403);
      }
      for (const extra of [{}, { 'X-CSRF-Token': 'f'.repeat(64) }, { 'X-CSRF-Token': csrf, Origin: 'https://attacker.invalid' }]) {
        assert.equal((await request('/logout', { method: 'POST', headers: { Cookie: cookie, ...extra } })).status, 403);
      }
      assert.equal(sessions.has(hash), true); assert.equal(writes, before);
    });
    await t.test('database failures neither grant access nor pretend logout succeeded', async () => {
      unavailable = true;
      assert.equal((await request('/session', { headers: { Cookie: cookie } })).status, 503);
      const result = await request('/logout', { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf } });
      assert.equal(result.status, 503); assert.equal(result.headers.get('set-cookie'), null);
      unavailable = false;
    });
    await t.test('SSE uses cookies; logout closes the stream and invalidates only this session on all instances', async () => {
      const other = (await login()).headers.get('set-cookie').split(';')[0];
      const controller = new AbortController();
      const stream = await request('/events', { headers: { Cookie: cookie }, signal: controller.signal });
      const reader = stream.body.getReader();
      assert.match(new TextDecoder().decode((await reader.read()).value), /event: ready/);
      const logout = await request('/logout', { method: 'POST', instance: 1, headers: { Cookie: cookie, 'X-CSRF-Token': csrf } });
      assert.equal(logout.status, 200); assert.ok(logout.headers.get('set-cookie').includes('Expires=Thu, 01 Jan 1970'));
      assert.equal((await reader.read()).done, true); controller.abort();
      for (const instance of [0, 1]) assert.equal((await request('/session', { instance, headers: { Cookie: cookie } })).status, 401);
      assert.equal((await request('/session', { headers: { Cookie: other } })).status, 200);
      assert.equal(sessions.has(hash), false);
    });
    await t.test('absolute expiry cannot be extended by polling', async () => {
      const loginResponse = await login(); const current = loginResponse.headers.get('set-cookie').split(';')[0];
      const currentHash = createHash('sha256').update(current.split('=')[1]).digest('hex');
      sessions.get(currentHash).expires_at = new Date(Date.now() - 1).toISOString();
      assert.equal((await request('/session', { headers: { Cookie: current } })).status, 401);
      assert.equal((await request('/events', { headers: { Cookie: current } })).status, 401);
    });
  } finally {
    for (const server of [...servers, database]) { server.close(); server.closeAllConnections(); }
    await Promise.all([...servers, database].map(server => once(server, 'close')));
  }
});
