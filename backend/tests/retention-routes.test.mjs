import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import express from 'express';
import { fixtureSession, serveSessionTable } from './helpers/admin-session.mjs';

test('retention preview and holds are owner-only, CSRF-protected and cannot mutate orders', async t => {
  const rows = Array.from({length: 51}, (_, i) => ({id: randomUUID(), order_number: `#${i}`, status: 'ny', payment_status: 'pending',
    payment_method: 'card', total_ore: 10000, created_at: '2026-05-22T12:00:00', customer_name: 'Hidden name', customer_phone: 'Hidden phone', customer_email: 'hidden@example.invalid'}));
  const holds = [], requests = [];
  let failHolds = false;
  const database = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url, 'http://localhost');
    if (await serveSessionTable(req, res, url)) return;
    const table = url.pathname.split('/').at(-1);
    requests.push({table, method: req.method});
    if (url.pathname === '/rest/v1/rpc/apply_order_retention') {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const input = JSON.parse(raw);
      requests.at(-1).body = input;
      res.end(JSON.stringify({runId: randomUUID(), orderId: input.p_order_id, fields: input.p_fields, performedAt: new Date().toISOString()}));
      return;
    }
    let result;
    if (table === 'admin_users') result = [{id: 'owner', role: 'owner'}, {id: 'local', role: 'location'}];
    else if (table === 'orders') result = rows;
    else if (table === 'order_items') result = [];
    else if (table === 'order_retention_holds') {
      if (failHolds) {res.statusCode = 500; res.end(JSON.stringify({message: 'synthetic unavailable'})); return;}
      result = holds;
    } else {res.statusCode = 500; res.end('{}'); return;}
    result = result.filter(row => [...url.searchParams].every(([key, value]) => {
      if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
      if (value.startsWith('in.(')) return value.slice(4, -1).split(',').includes(String(row[key]));
      if (value === 'is.null') return row[key] == null;
      return true;
    }));
    let raw = ''; for await (const chunk of req) raw += chunk;
    if (table === 'order_retention_holds' && req.method === 'POST') {
      const row = {id: randomUUID(), created_at: new Date().toISOString(), released_at: null, ...JSON.parse(raw)};
      holds.push(row); result = [row];
    }
    if (table === 'order_retention_holds' && req.method === 'PATCH') result.forEach(row => Object.assign(row, JSON.parse(raw)));
    const count = result.length;
    const offset = Number(url.searchParams.get('offset') ?? 0), limit = Number(url.searchParams.get('limit') ?? result.length);
    result = result.slice(offset, offset + limit);
    res.setHeader('Content-Range', `${offset}-${offset + result.length - 1}/${count}`);
    res.end(JSON.stringify(req.headers.accept?.includes('application/vnd.pgrst.object+json') ? result[0] ?? null : result));
  }).listen(0, '127.0.0.1');
  await once(database, 'listening');
  t.after(() => { database.closeAllConnections(); database.close(); });
  process.env.SUPABASE_URL = `http://127.0.0.1:${database.address().port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'retention-test-only';
  process.env.JWT_SECRET = 'retention-test-only-strong-secret-32';
  delete process.env.STRIPE_SECRET_KEY;
  const { registerRetentionRoutes } = await import('../dist/routes/orderRetention.js');
  const app = express(); app.use(express.json());
  const router = express.Router(); registerRetentionRoutes(router); app.use('/orders', router);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const ownerHeaders = fixtureSession({adminId: 'owner', email: 'owner@example.invalid'});
  const localHeaders = fixtureSession({adminId: 'local', email: 'local@example.invalid'});
  const call = (path, method = 'GET', body, headers = ownerHeaders) => fetch(`http://127.0.0.1:${server.address().port}/orders${path}`, {
    method, headers: {'Content-Type': 'application/json', ...headers}, ...(body ? {body: JSON.stringify(body)} : {}),
  });
  const valid = {fields: ['contact'], reason: 'complaint', reviewOn: '2090-01-01'};
  try {
    await t.test('anonymous and local admins cannot read preview or create/release holds', async () => {
      for (const [headers, expected] of [[{}, 401], [localHeaders, 403]]) {
        assert.equal((await call('/admin/retention-preview', 'GET', undefined, headers)).status, expected);
        assert.equal((await call(`/admin/${rows[0].id}/retention-holds`, 'POST', valid, headers)).status, expected);
        assert.equal((await call(`/admin/retention-holds/${randomUUID()}/release`, 'PATCH', {}, headers)).status, expected);
        assert.equal((await call(`/admin/${rows[0].id}/retention-erase`, 'POST', {}, headers)).status, expected);
      }
      assert.equal(requests.some(req => req.table === 'orders' || req.table === 'order_retention_holds'), false);
    });
    await t.test('preview is paginated, contains no customer content and performs only reads', async () => {
      const before = requests.length;
      const response = await call('/admin/retention-preview?page=2');
      assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
      const preview = await response.json();
      assert.equal(preview.readOnly, true); assert.equal(preview.total, 51); assert.equal(preview.orders.length, 1);
      assert.equal(JSON.stringify(preview).includes('Hidden'), false);
      assert.equal(JSON.stringify(preview).includes('hidden@example.invalid'), false);
      assert.equal(requests.slice(before).every(req => req.method === 'GET'), true);
      assert.equal(preview.orders[0].decisions.some(d => d.status === 'candidate'), false);
    });
    await t.test('invalid input and missing CSRF do not register holds', async () => {
      for (const body of [{...valid, fields: []}, {...valid, fields: ['arbitrary']}, {...valid, fields: ['contact', 'contact']},
        {...valid, reason: 'arbitrary'}, {...valid, reviewOn: '2026-02-30'}, {...valid, reviewOn: '2020-01-01'}, {...valid, responsibleName: 'forged'}]) {
        assert.equal((await call(`/admin/${rows[0].id}/retention-holds`, 'POST', body)).status, 400);
      }
      assert.equal((await call(`/admin/${rows[0].id}/retention-holds`, 'POST', valid, {Cookie: ownerHeaders.Cookie})).status, 403);
      assert.equal(holds.length, 0);
      assert.equal((await call('/admin/retention-preview?page=-1')).status, 400);
      assert.equal((await call('/admin/retention-preview?page=1.5')).status, 400);
    });
    await t.test('owner creates a scoped hold; overdue stays active; release is explicit and idempotent', async () => {
      const response = await call(`/admin/${rows[0].id}/retention-holds`, 'POST', valid);
      assert.equal(response.status, 201); const hold = await response.json();
      assert.equal(holds[0].responsible_admin_id, 'owner');
      holds[0].review_on = '2020-01-01';
      const preview = await (await call('/admin/retention-preview')).json();
      assert.equal(preview.orders[0].decisions.find(d => d.field === 'contact').status, 'hold');
      assert.equal(preview.orders[0].decisions.find(d => d.field === 'purchase_details').status, 'preserve');
      assert.equal((await call(`/admin/retention-holds/${hold.id}/release`, 'PATCH', {})).status, 200);
      assert.equal((await call(`/admin/retention-holds/${hold.id}/release`, 'PATCH', {})).status, 200);
      assert(holds[0].released_at);
      assert.equal(requests.some(req => req.table === 'orders' && req.method !== 'GET'), false);
    });
    await t.test('only an owner with fresh preview and purpose confirmation can call atomic erasure', async () => {
      const {retentionVersion} = await import('../dist/services/orderRetention.js');
      Object.assign(rows[0], {status: 'klar', payment_status: 'paid', created_at: '2020-01-01T12:00:00'});
      const input = {fields: ['contact'], version: retentionVersion(rows[0]), confirmedNoAccountingNeed: true, closedOn: '2021-01-01'};
      const appliedBefore = requests.filter(req => req.table === 'apply_order_retention').length;
      for (const [body, status] of [[{...input, version: 'stale'}, 409], [{...input, confirmedNoAccountingNeed: false}, 400],
        [{...input, fields: ['purchase_details']}, 400], [{...input, closedOn: '2090-01-01'}, 400], [{...input, p_admin_id: 'forged'}, 400]]) {
        assert.equal((await call(`/admin/${rows[0].id}/retention-erase`, 'POST', body)).status, status);
      }
      assert.equal((await call(`/admin/${rows[0].id}/retention-erase`, 'POST', input, {Cookie: ownerHeaders.Cookie})).status, 403);
      assert.equal(requests.filter(req => req.table === 'apply_order_retention').length, appliedBefore);
      const response = await call(`/admin/${rows[0].id}/retention-erase`, 'POST', input);
      assert.equal(response.status, 200);
      const outcome = await response.json();
      assert(outcome.runId); assert.deepEqual(outcome.fields, ['contact']);
      const operation = requests.find(req => req.table === 'apply_order_retention');
      assert.equal(operation.method, 'POST');
      assert.equal(operation.body.p_admin_id, 'owner');
      assert.equal(operation.body.p_rule, 'closed_order');
      assert.deepEqual(operation.body.p_fields, ['contact']);
      assert.equal(operation.body.p_expected.customer_email, 'hidden@example.invalid');
      assert.equal(JSON.stringify(outcome).includes('hidden@example.invalid'), false);
    });
    await t.test('missing holds table blocks preview and actual erasure', async () => {
      failHolds = true;
      assert.equal((await call('/admin/retention-preview')).status, 503);
      const {retentionVersion} = await import('../dist/services/orderRetention.js');
      const before = requests.filter(req => req.table === 'apply_order_retention').length;
      assert.equal((await call(`/admin/${rows[0].id}/retention-erase`, 'POST', {fields: ['contact'], version: retentionVersion(rows[0]), confirmedNoAccountingNeed: true, closedOn: '2021-01-01'})).status, 503);
      assert.equal(requests.filter(req => req.table === 'apply_order_retention').length, before);
    });
    await t.test('real checkout route blocks stale attempts but still starts a fresh card payment', async () => {
      const {default: fullRouter} = await import('../dist/routes/orders.js');
      app.use('/checkout-test', fullRouter);
      process.env.STRIPE_SECRET_KEY = 'sk_test_retention_synthetic_only';
      const {getStripe} = await import('../dist/services/stripeClient.js');
      const client = getStripe();
      const originalCreate = client.checkout.sessions.create;
      let starts = 0;
      client.checkout.sessions.create = async () => {starts++; return {id: 'cs_test_fresh', url: 'https://checkout.example.invalid/synthetic'};};
      const checkout = () => fetch(`http://127.0.0.1:${server.address().port}/checkout-test/checkout-session/${rows[0].id}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
      try {
        Object.assign(rows[0], {status: 'ny', payment_status: 'pending', created_at: '2020-01-01T12:00:00'});
        assert.equal((await checkout()).status, 400);
        assert.equal(starts, 0);
        rows[0].created_at = new Date().toISOString();
        const response = await checkout();
        assert.equal(response.status, 200);
        assert.equal(starts, 1);
        assert.equal((await response.json()).url, 'https://checkout.example.invalid/synthetic');
      } finally {client.checkout.sessions.create = originalCreate; delete process.env.STRIPE_SECRET_KEY;}
    });
  } finally {server.closeAllConnections(); database.closeAllConnections(); await Promise.all([new Promise(r => server.close(r)), new Promise(r => database.close(r))]);}
});
