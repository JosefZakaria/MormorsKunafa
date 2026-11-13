import { fixtureSession, serveSessionTable } from './helpers/admin-session.mjs';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import bcrypt from 'bcryptjs';

test('persistent abuse quotas protect login, orders and messages across app instances', async t => {
  const counters = new Map(), calls = [], sends = [];
  let now = Date.now(), unavailable = false, accountLookups = 0, businessWrites = 0;
  const owner = { id: 'owner', email: 'owner@example.invalid', password_hash: await bcrypt.hash('correct-password', 4),
    role: 'owner', display_name: 'Owner', location_id: null };
  const database = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url, 'http://localhost');
    if (await serveSessionTable(req, res, url)) return;
    let raw = '';
    for await (const chunk of req) raw += chunk;
    if (url.pathname === '/rest/v1/rpc/consume_api_rate_limits') {
      if (unavailable) { res.statusCode = 404; res.end(JSON.stringify({ code: 'PGRST202', message: 'Isolated missing migration' })); return; }
      const { p_rules: rules } = JSON.parse(raw);
      calls.push(rules);
      let retryAfter = 0;
      for (const rule of rules) {
        const counter = counters.get(rule.key);
        if (counter && counter.expiresAt > now && counter.count >= rule.limit) {
          retryAfter = Math.max(retryAfter, Math.ceil((counter.expiresAt - now) / 1000));
        }
      }
      if (!retryAfter) for (const rule of rules) {
        const counter = counters.get(rule.key);
        counters.set(rule.key, counter && counter.expiresAt > now
          ? { ...counter, count: counter.count + 1 } : { count: 1, expiresAt: now + rule.windowSeconds * 1000 });
      }
      res.end(JSON.stringify(retryAfter));
      return;
    }
    if (req.method !== 'GET') businessWrites++;
    let result = [];
    if (url.pathname === '/rest/v1/admin_users') {
      accountLookups++;
      result = url.searchParams.get('email') === `eq.${owner.email}` ? [owner] : [];
    } else if (url.pathname === '/rest/v1/admin_settings') {
      result = [{ default_preparation_time_minutes: 30, is_paused: false }];
    } else if (!['/rest/v1/locations', '/rest/v1/orders'].includes(url.pathname)) {
      res.statusCode = 500; res.end(JSON.stringify({ message: `Unexpected isolated table ${url.pathname}` })); return;
    }
    res.end(JSON.stringify(req.headers.accept?.includes('application/vnd.pgrst.object+json') ? result[0] ?? null : result));
  }).listen(0, '127.0.0.1');
  await once(database, 'listening');
  process.env.SUPABASE_URL = `http://127.0.0.1:${database.address().port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolated-rate-limit-test-only';
  process.env.JWT_SECRET = 'isolated-rate-limit-hmac-and-jwt-secret-at-least-32';
  process.env.VERCEL = '1';
  for (const key of ['RESEND_API_KEY', 'SINCH_PROJECT_ID', 'SINCH_KEY_ID', 'SINCH_KEY_SECRET', 'SINCH_APP_ID', 'STRIPE_SECRET_KEY']) delete process.env[key];
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.hostname === 'us.conversation.api.sinch.com' || url.hostname === 'api.resend.com') {
      sends.push(url.hostname);
      return new Response(JSON.stringify({ id: 'isolated-message' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    assert.equal(url.hostname, '127.0.0.1', 'Tests must not contact external services');
    return realFetch(input, init);
  });
  const { default: adminRouter } = await import('../dist/routes/admin.js');
  const { default: ordersRouter } = await import('../dist/routes/orders.js');
  const { clientAddress, consumeRateLimits, allowNotification } = await import('../dist/services/rateLimit.js');
  const { sendSms } = await import('../dist/services/SmsService.js');
  const { sendOrderConfirmationEmail } = await import('../dist/services/OrderConfirmationEmail.js');
  const servers = [0, 1].map(() => {
    const app = express();
    app.use(express.json());
    app.use('/admin', adminRouter);
    app.use('/orders', ordersRouter);
    return app.listen(0, '127.0.0.1');
  });
  await Promise.all(servers.map(server => once(server, 'listening')));
  const request = (path, body = {}, address = '203.0.113.1', instance = 0, method = 'POST') => fetch(
    `http://127.0.0.1:${servers[instance].address().port}${path}`, {
      method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': address, 'X-Admin-Request': '1' },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    });
  const reset = () => { counters.clear(); calls.length = 0; sends.length = 0; accountLookups = 0; businessWrites = 0; unavailable = false; };
  try {
    await t.test('login succeeds normally; distributed attempts for one account stop before password checking', async () => {
      reset();
      const valid = await request('/admin/login', { email: owner.email, password: 'correct-password' });
      assert.equal(valid.status, 200);
      assert.equal((await valid.json()).admin.id, 'owner');
      for (let attempt = 1; attempt < 20; attempt++) {
        assert.equal((await request('/admin/login', { email: owner.email, password: 'wrong' }, `203.0.113.${attempt + 1}`, attempt % 2)).status, 401);
      }
      const before = accountLookups;
      const blocked = await request('/admin/login', { email: ' OWNER@EXAMPLE.INVALID ', password: 'correct-password' }, '198.51.100.1', 1);
      assert.equal(blocked.status, 429);
      assert.equal(blocked.headers.get('retry-after'), '900');
      assert.equal(blocked.headers.get('cache-control'), 'no-store');
      assert.equal(accountLookups, before);
      now += 900_001;
      assert.equal((await request('/admin/login', { email: owner.email, password: 'correct-password' })).status, 200);
    });
    await t.test('IP quota stops account rotation; concurrent app instances cannot each get their own quota', async () => {
      reset();
      const responses = await Promise.all(Array.from({ length: 65 }, (_, index) => request('/admin/login',
        { email: `unknown-${index}@example.invalid`, password: 'wrong' }, '203.0.113.2', index % 2)));
      assert.equal(responses.filter(response => response.status === 401).length, 60);
      assert.equal(responses.filter(response => response.status === 429).length, 5);
      assert.equal(accountLookups, 60);
    });
    await t.test('order quotas count IP, normalized email and phone without creating blocked orders', async () => {
      reset();
      for (let index = 0; index < 30; index++) assert.equal((await request('/orders')).status, 400);
      assert.equal((await request('/orders', {}, '203.0.113.1', 1)).status, 429);
      assert.equal(businessWrites, 0);
      reset();
      for (let index = 0; index < 10; index++) assert.equal((await request('/orders',
        { customerInfo: { email: index % 2 ? ' TEST@EXAMPLE.INVALID ' : 'test@example.invalid' } }, `203.0.113.${index + 1}`, index % 2)).status, 400);
      assert.equal((await request('/orders', { deliveryInfo: { email: 'test@example.invalid' } }, '198.51.100.1')).status, 429);
      reset();
      const phones = ['0701234567', '+46701234567', '0046701234567', '070-123 45 67'];
      for (let index = 0; index < 10; index++) assert.equal((await request('/orders',
        { customerInfo: { phone: phones[index % phones.length] } }, `203.0.113.${index + 1}`, index % 2)).status, 400);
      assert.equal((await request('/orders', { deliveryInfo: { phone: '+46701234567' } }, '198.51.100.1')).status, 429);
      assert.equal(businessWrites, 0);
    });
    await t.test('customer polling is not throttled and no raw identities or passwords reach the counter store', async () => {
      const before = calls.length;
      for (let index = 0; index < 35; index++) assert.equal((await request('/orders/settings', undefined, '203.0.113.1', index % 2, 'GET')).status, 200);
      assert.equal(calls.length, before);
      const serialized = JSON.stringify(calls);
      for (const text of ['203.0.113', '198.51.100', 'test@example.invalid', '46701234567', 'wrong']) assert.equal(serialized.includes(text), false);
      for (const rule of calls.flat()) assert.match(rule.key, /^[a-z-]+:[a-f0-9]{64}$/);
    });
    await t.test('forwarded addresses are trusted only in Vercel; equivalent IPv6 addresses share a key', () => {
      const req = value => ({ get: () => value, socket: { remoteAddress: '::ffff:127.0.0.1' } });
      delete process.env.VERCEL;
      assert.equal(clientAddress(req('203.0.113.1')), '127.0.0.1');
      assert.equal(clientAddress(req('198.51.100.2')), '127.0.0.1');
      process.env.VERCEL = '1';
      assert.equal(clientAddress(req('2001:db8:0:0:0:0:0:1')), clientAddress(req('2001:db8::1')));
      assert.throws(() => clientAddress(req(undefined)));
      assert.throws(() => clientAddress(req('not-an-ip')));
    });
    await t.test('outbound SMS and email obey recipient quotas and preserve other recipients global allowance', async () => {
      reset();
      Object.assign(process.env, { SINCH_PROJECT_ID: 'test', SINCH_KEY_ID: 'test', SINCH_KEY_SECRET: 'test', SINCH_APP_ID: 'test', RESEND_API_KEY: 're_isolated' });
      for (let index = 0; index < 20; index++) await sendSms(index % 2 ? '+46701234567' : '0701234567', 'Synthetic message');
      await sendSms('0046701234567', 'Blocked synthetic message');
      assert.equal(sends.length, 20);
      const smsGlobal = [...counters.keys()].find(key => key.startsWith('sms-global:'));
      assert.equal(counters.get(smsGlobal).count, 20);
      await sendSms('0709999999', 'Different synthetic recipient');
      assert.equal(sends.length, 21);
      const context = { order: { order_number: '#synthetic', order_type: 'delivery', total_ore: 5000, customer_email: 'test@example.invalid' }, items: [] };
      for (let index = 0; index < 20; index++) await sendOrderConfirmationEmail(context);
      await sendOrderConfirmationEmail({ ...context, order: { ...context.order, customer_email: ' TEST@EXAMPLE.INVALID ' } });
      assert.equal(sends.filter(host => host === 'api.resend.com').length, 20);
      const emailGlobal = [...counters.keys()].find(key => key.startsWith('email-global:'));
      assert.equal(counters.get(emailGlobal).count, 20);
      counters.get(emailGlobal).count = 1000;
      assert.equal(await allowNotification('email', 'different@example.invalid'), false);
      now += 3600_001;
      assert.equal(await allowNotification('email', 'test@example.invalid'), true);
    });
    await t.test('missing store blocks login/orders and messages; absent provider config still skips sending', async () => {
      reset(); unavailable = true;
      assert.equal((await request('/admin/login', { email: owner.email, password: 'correct-password' })).status, 503);
      assert.equal((await request('/orders')).status, 503);
      assert.equal(accountLookups, 0);
      assert.equal(businessWrites, 0);
      await assert.rejects(sendSms('0701234567', 'Not sent'), /store is unavailable/);
      await assert.rejects(sendOrderConfirmationEmail({ order: { customer_email: 'test@example.invalid' }, items: [] }), /store is unavailable/);
      assert.equal(sends.length, 0);
      delete process.env.SINCH_PROJECT_ID;
      delete process.env.RESEND_API_KEY;
      await sendSms('0701234567', 'Not configured');
      await sendOrderConfirmationEmail({ order: { customer_email: 'test@example.invalid' }, items: [] });
      assert.equal(sends.length, 0);
      unavailable = false;
      process.env.JWT_SECRET = '';
      await assert.rejects(consumeRateLimits([{ scope: 'test', identifier: 'synthetic', limit: 1, windowSeconds: 60 }]), /secret is not configured/);
    });
  } finally {
    for (const server of [...servers, database]) server.closeAllConnections();
    await Promise.all([...servers, database].map(server => new Promise(resolve => server.close(resolve))));
  }
});
