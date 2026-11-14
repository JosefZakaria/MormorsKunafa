import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';

const minute = 60_000;
const now = Date.parse('2026-11-11T12:00:00Z');
// Orders store UTC as timestamp without time zone.
const at = (ms) => new Date(ms).toISOString().replace('Z', '');

test('admin realtime token, reminder cron and reminder timing', async t => {
  let ordersQuery = null;
  const rows = [
    { id: 'due', order_number: '101', order_type: 'takeaway', location_id: '1', payment_method: 'card', payment_status: 'paid', created_at: at(now - 4 * minute), scheduled_at: null },
    { id: 'fresh', order_number: '102', order_type: 'takeaway', location_id: '1', payment_method: 'card', payment_status: 'paid', created_at: at(now - minute), scheduled_at: null },
    { id: 'unpaid', order_number: '103', order_type: 'takeaway', location_id: '1', payment_method: 'card', payment_status: 'pending', created_at: at(now - 4 * minute), scheduled_at: null },
    { id: 'phone', order_number: '104', order_type: 'takeaway', location_id: '1', payment_method: 'pay_at_pickup', payment_status: 'pending', created_at: at(now - 5 * minute), scheduled_at: null },
  ];
  const database = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    assert.equal(url.pathname, '/rest/v1/orders');
    ordersQuery = url.searchParams;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(rows));
  }).listen(0, '127.0.0.1');
  await once(database, 'listening');
  t.after(() => database.close());

  process.env.SUPABASE_URL = `http://127.0.0.1:${database.address().port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-only';
  process.env.JWT_SECRET = 'isolated-realtime-test-secret-at-least-32-chars';
  process.env.CRON_SECRET = 'cron-test-secret';
  delete process.env.SUPABASE_JWT_SECRET;
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  const { createAdminRealtimeToken, needsReminder, reminderEventId, sendUnacceptedOrderReminders } =
    await import('../dist/services/realtimeEvents.js');

  // Fails closed without the signing secret, and never hands out the service key.
  assert.equal(createAdminRealtimeToken('admin-1'), null);
  process.env.SUPABASE_JWT_SECRET = 'supabase-jwt-test-secret';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'service-role-test-only';
  assert.equal(createAdminRealtimeToken('admin-1'), null);
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

  const access = createAdminRealtimeToken('admin-1');
  assert.equal(access.apiKey, 'sb_publishable_test');
  assert.equal(access.topic, 'admin-orders');
  const claims = jwt.verify(access.token, 'supabase-jwt-test-secret', { algorithms: ['HS256'] });
  assert.equal(claims.role, 'anon', 'never authenticated or service_role');
  assert.equal(claims.mk_admin, true);
  assert.equal(claims.sub, 'admin-1');
  assert.equal(claims.exp - claims.iat, 15 * 60);
  assert.throws(() => jwt.verify(access.token, process.env.JWT_SECRET), 'not usable as an admin login token');

  // One stable uuid per order, so the push log lets each reminder fire once.
  assert.match(reminderEventId('order-1'), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(reminderEventId('order-1'), reminderEventId('order-1'));
  assert.notEqual(reminderEventId('order-1'), reminderEventId('order-2'));

  assert.equal(needsReminder({ created_at: at(now - 2 * minute), scheduled_at: null }, now), false);
  assert.equal(needsReminder({ created_at: at(now - 3 * minute), scheduled_at: null }, now), true);
  assert.equal(needsReminder({ created_at: at(now - 3 * 60 * minute), scheduled_at: null }, now), false, 'old orders are not news');
  // A pre-order waits from pickup minus 20 minutes, not from when it was placed.
  assert.equal(needsReminder({ created_at: at(now - 24 * 60 * minute), scheduled_at: at(now + 18 * minute) }, now), false);
  assert.equal(needsReminder({ created_at: at(now - 24 * 60 * minute), scheduled_at: at(now + 16 * minute) }, now), true);

  // Paid and phone orders waiting 3+ minutes; unpaid and fresh orders are skipped.
  assert.equal(await sendUnacceptedOrderReminders(now), 2);
  assert.equal(ordersQuery.get('status'), 'eq.ny');
  assert.match(ordersQuery.get('or'), /created_at\.gte\..*scheduled_at\.gte\./);

  const { default: adminRouter } = await import('../dist/routes/admin.js');
  const app = express();
  app.use('/api/admin', adminRouter);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api/admin`;
  const cron = (authorization) => fetch(`${base}/cron/order-reminders`, { headers: authorization ? { authorization } : {} });

  assert.equal((await cron()).status, 401);
  assert.equal((await cron('Bearer wrong')).status, 401);
  assert.equal((await cron('Bearer cron-test-secret-but-longer')).status, 401);
  const ok = await cron('Bearer cron-test-secret');
  assert.equal(ok.status, 200);
  assert.equal(typeof (await ok.json()).reminded, 'number');
  delete process.env.CRON_SECRET;
  assert.equal((await cron('Bearer undefined')).status, 401, 'unset secret never matches');

  assert.equal((await fetch(`${base}/realtime-token`)).status, 401, 'token needs an admin login');
  assert.equal((await fetch(`${base}/events`)).status, 404, 'SSE endpoint is gone');
});
