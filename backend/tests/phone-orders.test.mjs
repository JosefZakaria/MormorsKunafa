import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import express from 'express';

test('owner phone orders enter the selected location queue without online payment', async t => {
  const hoja = '2f1a9c4e-6b7d-4e8f-a901-b2c3d4e5f601';
  const mollan = '2f1a9c4e-6b7d-4e8f-a901-b2c3d4e5f602';
  const productId = '11111111-1111-4111-8111-111111111111';
  const products = [{ id: productId, name: 'Kunafa', price_ore: 9000, hidden: false, stock_status: 'instock', variant_prices: { '250 gram': 5000 } }];
  const places = [hoja, mollan].map((id, i) => ({ id, name: i ? 'Möllevången' : 'Höja', slug: i ? 'mollevangen' : 'hoja', takeaway_enabled: true, is_paused: false }));
  const users = [{ id: 'owner', role: 'owner', location_id: null }, { id: 'hoja-admin', role: 'location', location_id: hoja }, { id: 'mollan-admin', role: 'location', location_id: mollan }];
  const orders = [], items = [], requests = [], pushSubscriptions = [], pushLogs = [];
  let unavailable = false, failItems = false;
  const database = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url, 'http://localhost');
    const table = url.pathname.split('/').at(-1);
    requests.push({ table, method: req.method, query: url.searchParams.toString() });
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const data = raw ? JSON.parse(raw) : undefined;
    const tables = {
      orders, order_items: items, products, locations: places, admin_users: users,
      admin_push_subscriptions: pushSubscriptions, admin_push_delivery_logs: pushLogs,
      admin_settings: [{ id: 'settings', is_paused: false, default_preparation_time_minutes: 30 }],
      product_location_stock: unavailable ? [{ product_id: productId, location_id: hoja, in_stock: false }] : [],
    };
    let result = tables[table];
    if (!result) { res.statusCode = 500; res.end(JSON.stringify({ message: `Unexpected table ${table}` })); return; }
    const matches = row => [...url.searchParams].every(([key, value]) => {
      if (key === 'or') return row.payment_status === 'paid' || row.payment_method === 'pay_at_pickup';
      if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
      if (value.startsWith('in.(')) return value.slice(4, -1).split(',').includes(String(row[key]));
      if (value.startsWith('not.is.')) return row[key] != null;
      return true;
    });
    if (req.method === 'POST') {
      if (table === 'order_items' && failItems) { res.statusCode = 500; res.end(JSON.stringify({ message: 'Test item insert failure', code: 'XX000' })); return; }
      if (table === 'orders' && orders.some(order => order.id === data.id)) { res.statusCode = 409; res.end(JSON.stringify({ message: 'duplicate', code: '23505' })); return; }
      const rows = Array.isArray(data) ? data : [data];
      for (const row of rows) result.push({ created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row });
      result = rows;
    } else {
      result = result.filter(matches);
      if (req.method === 'PATCH') result.forEach(row => Object.assign(row, data));
      if (req.method === 'DELETE') {
        tables[table].splice(0, tables[table].length, ...tables[table].filter(row => !matches(row)));
        if (table === 'orders') items.splice(0, items.length, ...items.filter(item => !result.some(order => order.id === item.order_id)));
      }
    }
    res.end(JSON.stringify(req.headers.accept?.includes('application/vnd.pgrst.object+json') ? result[0] ?? null : result));
  }).listen(0, '127.0.0.1');
  await once(database, 'listening');
  process.env.SUPABASE_URL = `http://127.0.0.1:${database.address().port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'phone-orders-test-only';
  process.env.JWT_SECRET = 'phone-orders-test-only';
  for (const key of ['RESEND_API_KEY', 'STRIPE_SECRET_KEY', 'SINCH_PROJECT_ID', 'SINCH_KEY_ID', 'SINCH_KEY_SECRET', 'SINCH_APP_ID', 'WEB_PUSH_VAPID_PUBLIC_KEY', 'WEB_PUSH_VAPID_PRIVATE_KEY']) delete process.env[key];
  const { default: router } = await import('../dist/routes/orders.js');
  const { signToken } = await import('../dist/middleware/auth.js');
  const { registerRealtimeClient, dispatchOrderCreatedEvent } = await import('../dist/services/realtimeEvents.js');
  const streamHoja = [], streamMollan = [], streamOwner = [];
  const disconnectOwner = registerRealtimeClient({ adminId: 'owner', role: 'owner', locationId: null, fulfillsDelivery: false }, { write: text => streamOwner.push(text) });
  const disconnectHoja = registerRealtimeClient({ adminId: 'hoja-admin', role: 'location', locationId: hoja, fulfillsDelivery: false }, { write: text => streamHoja.push(text) });
  const disconnectMollan = registerRealtimeClient({ adminId: 'mollan-admin', role: 'location', locationId: mollan, fulfillsDelivery: false }, { write: text => streamMollan.push(text) });
  const app = express();
  app.use(express.json()); app.use('/orders', router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/orders`;
  const token = id => signToken({ adminId: id, email: `${id}@test.local`, role: id === 'owner' ? 'owner' : 'location' });
  const call = (path, method = 'GET', body, user = 'owner') => fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${token(user)}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = (locationId = hoja) => ({ requestId: randomUUID(), locationId, customer: { firstName: 'Anna', lastName: 'Andersson', phone: '0701234567', email: 'anna@example.test' }, items: [{ productId: `${productId}-250 gram`, quantity: 2 }], notes: 'Ring vid hämtning' });
  let phoneOrder;
  try {
    await t.test('anonymous and location accounts cannot create orders; live role beats JWT', async () => {
      assert.equal((await call('/admin/phone-orders', 'POST', payload(), null)).status, 401);
      assert.equal((await call('/admin/phone-orders', 'POST', payload(), 'hoja-admin')).status, 403);
      assert.equal((await call('/admin/phone-orders', 'POST', payload(), 'deleted-admin')).status, 403);
      users[0].role = 'location'; users[0].location_id = hoja;
      assert.equal((await call('/admin/phone-orders', 'POST', payload())).status, 403);
      users[0].role = 'owner'; users[0].location_id = null;
      assert.equal(orders.length, 0);
    });
    await t.test('server prices, contact info, unpaid status and location event are saved', async () => {
      const body = { ...payload(), paymentMethod: 'card', paymentStatus: 'paid' };
      body.items[0].price = 1;
      const result = await call('/admin/phone-orders', 'POST', body);
      assert.equal(result.status, 201);
      phoneOrder = await result.json();
      assert.equal(phoneOrder.paymentStatus, 'pending');
      assert.equal(phoneOrder.paymentMethod, 'pay_at_pickup');
      assert.equal(phoneOrder.orderType, 'takeaway');
      assert.equal(phoneOrder.locationId, hoja);
      assert.equal(phoneOrder.totalPrice, 10000);
      assert.equal(phoneOrder.items[0].productName, 'Kunafa (250 gram)');
      assert.deepEqual(phoneOrder.customerInfo, { name: 'Anna Andersson', phone: '0701234567', email: 'anna@example.test' });
      assert.match(streamHoja.join(''), /ORDER_CREATED/);
      assert.doesNotMatch(streamMollan.join(''), /ORDER_CREATED/);
      assert.doesNotMatch(streamOwner.join(''), /ORDER_CREATED/);
      const eventsBefore = streamHoja.length;
      assert.equal((await call('/admin/phone-orders', 'POST', body)).status, 200);
      assert.equal(orders.length, 1);
      assert.equal(streamHoja.length, eventsBefore);
      const itemInsert = requests.findIndex(row => row.table === 'order_items' && row.method === 'POST');
      const publication = requests.findIndex(row => row.table === 'orders' && row.method === 'PATCH');
      assert.ok(itemInsert < publication);
    });
    await t.test('unpaid phone orders enter only the correct queue; unpaid online and cash orders stay out', async () => {
      orders.push({ id: randomUUID(), status: 'ny', location_id: hoja, order_type: 'takeaway', payment_method: 'card', payment_status: 'pending' });
      orders.push({ id: randomUUID(), status: 'ny', location_id: hoja, order_type: 'takeaway', payment_method: 'cash', payment_status: 'pending' });
      const pending = await (await call('/admin/pending', 'GET', undefined, 'hoja-admin')).json();
      assert.deepEqual(pending.map(order => order.id), [phoneOrder.id]);
      assert.deepEqual(await (await call('/admin/pending', 'GET', undefined, 'mollan-admin')).json(), []);
      assert.deepEqual(await (await call('/admin/pending')).json(), []);
    });
    await t.test('invalid contacts, quantities, products, variants and unavailable stock create no order', async () => {
      const before = orders.length;
      for (const change of [
        { customer: { ...payload().customer, firstName: 'a'.repeat(81) } },
        { customer: { ...payload().customer, phone: 'abc' } },
        { customer: { ...payload().customer, email: 'invalid' } },
        { items: [{ productId, quantity: -1 }] },
        { items: [{ productId, quantity: 1.5 }] },
        { items: [{ productId: randomUUID(), quantity: 1 }] },
        { items: [{ productId: `${productId}-not-a-size`, quantity: 1 }] },
        { items: [{ productId, quantity: 1 }] },
      ]) assert.equal((await call('/admin/phone-orders', 'POST', { ...payload(), ...change })).status, 400);
      unavailable = true;
      assert.equal((await call('/admin/phone-orders', 'POST', payload())).status, 409);
      unavailable = false;
      products[0].hidden = true;
      assert.equal((await call('/admin/phone-orders', 'POST', payload())).status, 400);
      products[0].hidden = false;
      places[0].is_paused = true;
      assert.equal((await call('/admin/phone-orders', 'POST', payload())).status, 403);
      places[0].is_paused = false;
      assert.equal(orders.length, before);
    });
    await t.test('failed item writes never publish partial orders and the same draft can retry', async () => {
      const body = payload(mollan);
      failItems = true;
      assert.equal((await call('/admin/phone-orders', 'POST', body)).status, 500);
      assert.ok(!orders.some(order => order.id === body.requestId));
      failItems = false;
      assert.equal((await call('/admin/phone-orders', 'POST', body)).status, 201);
      assert.match(streamMollan.join(''), /ORDER_CREATED/);
    });
    await t.test('phone orders remain visible after acceptance and payment requires explicit collection', async () => {
      assert.equal((await call(`/admin/${phoneOrder.id}/accept`, 'PATCH', {})).status, 403);
      assert.equal((await call(`/admin/${phoneOrder.id}/status`, 'PATCH', { status: 'mottagen' })).status, 403);
      assert.equal((await call(`/admin/${phoneOrder.id}/accept`, 'PATCH', {}, 'mollan-admin')).status, 403);
      assert.equal((await call(`/admin/${phoneOrder.id}/accept`, 'PATCH', {}, 'hoja-admin')).status, 200);
      assert.match(streamOwner.join(''), /PHONE_ORDER_ACCEPTED/);
      assert.doesNotMatch(streamOwner.join(''), /ORDER_CREATED/);
      assert.doesNotMatch(streamMollan.join(''), /PHONE_ORDER_ACCEPTED/);
      assert.deepEqual(await (await call('/admin/pending')).json(), []);
      const ownerActive = await (await call('/admin/active')).json();
      assert.deepEqual(ownerActive.map(order => order.id), [phoneOrder.id]);
      assert.equal(ownerActive[0].status, 'mottagen');
      const active = await (await call('/admin/active', 'GET', undefined, 'hoja-admin')).json();
      assert.deepEqual(active.map(order => order.id), [phoneOrder.id]);
      assert.equal(active[0].paymentStatus, 'pending');
      assert.equal((await call(`/admin/${phoneOrder.id}/status`, 'PATCH', { status: 'klar' }, 'hoja-admin')).status, 200);
      assert.equal((await call(`/admin/${phoneOrder.id}/status`, 'PATCH', { status: 'uthämtad' }, 'hoja-admin')).status, 400);
      const collected = await call(`/admin/${phoneOrder.id}/status`, 'PATCH', { status: 'uthämtad', paymentReceived: true }, 'hoja-admin');
      assert.equal(collected.status, 200);
      assert.equal((await collected.json()).paymentStatus, 'paid');
    });
    await t.test('online orders still notify the owner and the selected location', async () => {
      const online = { id: randomUUID(), order_number: '#online', status: 'ny', order_type: 'takeaway', location_id: hoja, payment_method: 'card', payment_status: 'paid' };
      orders.push(online);
      const ownerBefore = streamOwner.length, hojaBefore = streamHoja.length, mollanBefore = streamMollan.length;
      dispatchOrderCreatedEvent(online.id, online.order_number, 'takeaway', hoja);
      assert.match(streamOwner.slice(ownerBefore).join(''), /ORDER_CREATED/);
      assert.match(streamHoja.slice(hojaBefore).join(''), /ORDER_CREATED/);
      assert.equal(streamMollan.length, mollanBefore);
      assert.deepEqual((await (await call('/admin/pending')).json()).map(order => order.id), [online.id]);
    });
    await t.test('contact details may be empty, omitted or partly filled in', async () => {
      for (const customer of [
        undefined, {}, { firstName: '', lastName: '', phone: '', email: '' },
        { firstName: '  ', lastName: '  ', phone: '  ', email: '  ' },
        { firstName: ' Anna ' }, { lastName: ' Andersson ' },
        { phone: '0701234567' }, { email: 'anna@example.test' },
      ]) {
        const body = { ...payload(mollan), customer };
        const response = await call('/admin/phone-orders', 'POST', body);
        assert.equal(response.status, 201);
        const order = await response.json();
        const saved = orders.find(row => row.id === body.requestId);
        const name = `${customer?.firstName?.trim() ?? ''} ${customer?.lastName?.trim() ?? ''}`.trim();
        assert.equal(saved.customer_name, name);
        assert.equal(saved.customer_phone, customer?.phone?.trim() ?? '');
        assert.equal(saved.customer_email, customer?.email?.trim() ?? '');
        assert.equal(order.paymentStatus, 'pending');
        if (!name && !saved.customer_phone && !saved.customer_email) assert.equal(order.customerInfo, undefined);
        else assert.equal(order.customerInfo.name, name);
      }
    });
    await t.test('public checkout cannot forge the admin-only payment method', async () => {
      const response = await call('/', 'POST', { items: [{ productId, quantity: 1 }], customerInfo: { email: 'anna@example.test' }, paymentMethod: 'pay_at_pickup' }, null);
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /payment method/);
    });
    await t.test('phone push reaches only the selected location; online push still includes the owner', async () => {
      const { default: webpush } = await import('web-push');
      const keys = webpush.generateVAPIDKeys();
      process.env.WEB_PUSH_VAPID_PUBLIC_KEY = keys.publicKey;
      process.env.WEB_PUSH_VAPID_PRIVATE_KEY = keys.privateKey;
      const { configureWebPush, sendOrderCreatedPush } = await import('../dist/services/pushNotifications.js');
      const sent = [];
      t.mock.method(webpush, 'sendNotification', async target => { sent.push(target.endpoint); return { statusCode: 201 }; });
      configureWebPush();
      for (const id of ['owner', 'hoja-admin', 'mollan-admin']) pushSubscriptions.push({ id, admin_id: id, endpoint: `https://push.example.test/${id}`, p256dh: 'test', auth: 'test', disabled_at: null });
      const event = { event_id: randomUUID(), event_type: 'ORDER_CREATED', order_id: phoneOrder.id, order_number: '#phone', order_type: 'takeaway', location_id: mollan, created_at: new Date().toISOString(), location_accounts_only: true };
      await sendOrderCreatedPush(event);
      assert.deepEqual(sent, ['https://push.example.test/mollan-admin']);
      sent.length = 0;
      await sendOrderCreatedPush({ ...event, event_id: randomUUID(), location_accounts_only: false });
      assert.deepEqual(sent.sort(), ['https://push.example.test/mollan-admin', 'https://push.example.test/owner']);
    });
  } finally {
    disconnectHoja(); disconnectMollan(); disconnectOwner();
    server.close(); database.close();
    await Promise.all([once(server, 'close'), once(database, 'close')]);
  }
});
