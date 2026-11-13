import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import {
  defaultOpeningHours, getHoursForDate, getOrderableClockRange, findNextOrderableSlot,
  parseOpeningHours, validateScheduledOrderTime,
} from '../dist/shared/utils/openingHours.js';

test('location hours resolve weekly closures and date overrides in Stockholm', () => {
  const hoja = defaultOpeningHours('hoja');
  const molle = defaultOpeningHours('mollevangen');
  const now = new Date('2026-11-11T10:00:00Z');
  assert.equal(getHoursForDate('2026-11-16', hoja), null);
  assert.deepEqual(getHoursForDate('2026-11-16', molle), { open: '11:00', close: '22:00' });
  hoja.exceptions['2026-11-16'] = { open: '12:00', close: '18:00' };
  assert.deepEqual(getOrderableClockRange('2026-11-16', 30, now, hoja), { min: '12:30', max: '17:30' });
  assert.equal(validateScheduledOrderTime('2026-11-16T18:00:00', 30, now, hoja).valid, false);
  assert.equal(validateScheduledOrderTime('2026-11-16T13:00:00', 30, now, hoja).valid, true);
  hoja.exceptions['2026-11-11'] = null;
  assert.equal(validateScheduledOrderTime(undefined, 30, now, hoja).valid, false);
  delete hoja.exceptions['2026-11-16'];
  assert.equal(getHoursForDate('2026-11-16', hoja), null);
  assert.equal(getOrderableClockRange('2026-11-10', 30, now, hoja), null);
  assert.deepEqual(findNextOrderableSlot(30, new Date('2026-11-15T22:40:00Z'), 30, hoja),
    { dateStr: '2026-11-17', clock: '11:30' });
  const closed = { weekly: Object.fromEntries(Array.from({ length: 7 }, (_, day) => [day, null])), exceptions: {} };
  assert.deepEqual(findNextOrderableSlot(30, now, 30, closed), { dateStr: '', clock: '' });
});

test('hours reject malformed dates, partial weeks and overnight or invalid clocks', () => {
  const schedule = defaultOpeningHours('hoja');
  assert.deepEqual(parseOpeningHours(schedule), schedule);
  for (const invalid of [null, {}, { weekly: {}, exceptions: {} },
    { ...schedule, exceptions: { '2026-02-30': null } },
    { ...schedule, exceptions: { '2026-12-24': { open: '22:00', close: '11:00' } } },
    { ...schedule, exceptions: { '2026-12-24': { open: '25:00', close: '26:00' } } },
  ]) assert.throws(() => parseOpeningHours(invalid));
});

test('superadmin saves hours, public settings refresh and checkout enforces the saved closure', async t => {
  const hojaId = '2f1a9c4e-6b7d-4e8f-a901-b2c3d4e5f601';
  const molleId = '2f1a9c4e-6b7d-4e8f-a901-b2c3d4e5f602';
  const places = [
    { id: hojaId, slug: 'hoja', name: 'Höja', fulfills_delivery: true, takeaway_enabled: true, is_paused: false },
    { id: molleId, slug: 'mollevangen', name: 'Möllevången', takeaway_enabled: true, is_paused: false },
  ];
  const users = [
    { id: 'owner', role: 'owner', location_id: null },
    { id: 'staff', role: 'location', location_id: hojaId },
  ];
  const writes = [];
  const database = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const table = url.pathname.split('/').at(-1);
    const tables = {
      locations: places, admin_users: users, orders: [], product_location_stock: [],
      admin_settings: [{ id: 'settings', is_paused: false, default_preparation_time_minutes: 30 }],
    };
    res.setHeader('Content-Type', 'application/json');
    if (!tables[table]) { res.statusCode = 500; res.end('{}'); return; }
    let rows = tables[table].filter(row => [...url.searchParams].every(([key, value]) =>
      !value.startsWith('eq.') || String(row[key]) === value.slice(3)
    ));
    if (req.method !== 'GET') {
      writes.push(table);
      assert.equal(table, 'locations');
      assert.equal(req.method, 'PATCH');
      let raw = '';
      for await (const chunk of req) raw += chunk;
      for (const row of rows) Object.assign(row, JSON.parse(raw));
    }
    res.end(JSON.stringify(rows));
  }).listen(0, '127.0.0.1');
  t.after(() => database.close());
  await once(database, 'listening');
  process.env.SUPABASE_URL = `http://127.0.0.1:${database.address().port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolated-opening-hours-test-only';
  process.env.JWT_SECRET = 'isolated-opening-hours-test-secret-long-enough';
  process.env.NODE_ENV = 'production';
  const { default: app } = await import('../dist/index.js');
  const { signToken } = await import('../dist/middleware/auth.js');
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const patch = (body, user = 'owner') => fetch(`${base}/admin/locations/${hojaId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json',
      ...(user ? { Authorization: `Bearer ${signToken({ adminId: user, email: `${user}@example.invalid` })}` } : {}),
    }, body: JSON.stringify(body),
  });
  const schedule = defaultOpeningHours('hoja');
  schedule.weekly[2] = { open: '12:00', close: '18:00' };
  schedule.exceptions['2099-01-05'] = null;
  assert.equal((await patch({ openingHours: schedule }, null)).status, 401);
  assert.equal((await patch({ openingHours: schedule, isPaused: true }, 'staff')).status, 403);
  assert.equal((await patch({ openingHours: { ...schedule, weekly: {} } })).status, 400);
  assert.equal(writes.length, 0);
  const saved = await patch({ openingHours: schedule });
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).openingHours, schedule);
  assert.equal(places[0].is_paused, false);
  const response = await fetch(`${base}/orders/settings`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const publicSettings = await response.json();
  assert.deepEqual(publicSettings.locations.find(place => place.id === hojaId).openingHours, schedule);
  assert.deepEqual(publicSettings.locations.find(place => place.id === molleId).openingHours, defaultOpeningHours('mollevangen'));

  const order = await fetch(`${base}/orders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderType: 'takeaway', locationId: hojaId, paymentMethod: 'card',
      scheduledTime: '2099-01-05T12:00:00', customerInfo: { email: 'test@example.invalid', phone: '0701234567' },
      items: [{ productId: '11111111-1111-4111-8111-111111111111', productName: 'Test', quantity: 1, price: 1000 }],
    }),
  });
  assert.equal(order.status, 400);
  assert.match((await order.json()).error, /stängt/);
  assert.deepEqual(writes, ['locations']);
});
