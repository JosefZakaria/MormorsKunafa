import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';

test('guest checkout validates catalog lines and separates customer status from admin data', async t => {
  const secret = 'isolated-order-security-secret-at-least-32-characters';
  const plain = '11111111-1111-4111-8111-111111111111';
  const variant = '22222222-2222-4222-8222-222222222222';
  const bread = '856b591e-08b3-40ec-b505-cb3b143293bb';
  const box = 'c005c8af-3f2e-401c-923f-7dac0f682cda';
  const mix = '9e6d210b-8637-4deb-889c-0726060288aa';
  const products = [
    { id: plain, name: 'Kunafa', price_ore: 5000, hidden: false },
    { id: variant, name: 'Portionskunafa', price_ore: 1000, variant_prices: { '2 personer': 14900, '500 gram': 12900 }, hidden: false },
    { id: bread, name: 'Bröd', price_ore: 1500, hidden: false },
    { id: box, name: 'Mormorsbox', price_ore: 29900, hidden: false },
    { id: mix, name: 'Pistagemix', price_ore: 49900, hidden: false },
  ];
  const orders = [], items = [];
  let writes = 0, catalogUnavailable = false;
  const database = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url, 'http://localhost');
    const table = url.pathname.split('/').at(-1);
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const data = raw ? JSON.parse(raw) : undefined;
    const tables = { orders, order_items: items, products,
      admin_settings: [{ id: 'settings', default_preparation_time_minutes: 30,
        delivery_default_fee_ore: 9950, delivery_city_fees: [], is_paused: false }],
      admin_users: [{ id: 'owner', role: 'owner', location_id: null }],
      locations: [{ id: 'pickup', name: 'Testlokal', slug: 'hoja', takeaway_enabled: true,
        opening_hours: { weekly: Object.fromEntries(Array.from({ length: 7 }, (_, day) => [day, { open: '00:00', close: '23:59' }])), exceptions: {} } }],
      product_location_stock: [], admin_push_subscriptions: [],
    };
    if (table === 'products' && catalogUnavailable) {
      res.statusCode = 503;
      res.end(JSON.stringify({ message: 'Isolated catalog failure' }));
      return;
    }
    let result = tables[table];
    if (!result) { res.statusCode = 500; res.end(JSON.stringify({ message: `Unexpected table ${table}` })); return; }
    const matches = row => [...url.searchParams].every(([key, value]) => {
      if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
      if (value.startsWith('in.(')) return value.slice(4, -1).split(',').includes(String(row[key]));
      return true;
    });
    if (req.method !== 'GET') writes++;
    if (req.method === 'POST') {
      const rows = (Array.isArray(data) ? data : [data]).map(row => ({ created_at: new Date().toISOString(), ...row }));
      result.push(...rows);
      result = rows;
    } else {
      result = result.filter(matches);
      if (req.method === 'PATCH') result.forEach(row => Object.assign(row, data));
    }
    res.end(JSON.stringify(req.headers.accept?.includes('application/vnd.pgrst.object+json') ? result[0] ?? null : result));
  }).listen(0, '127.0.0.1');
  await once(database, 'listening');
  process.env.SUPABASE_URL = `http://127.0.0.1:${database.address().port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolated-security-test-only';
  process.env.JWT_SECRET = secret;
  process.env.STRIPE_SECRET_KEY = 'sk_test_isolated_security_only';
  process.env.PUBLIC_WEB_APP_URL = 'https://store.example.invalid';
  for (const key of ['RESEND_API_KEY', 'SINCH_PROJECT_ID', 'SINCH_KEY_ID', 'SINCH_KEY_SECRET', 'SINCH_APP_ID', 'WEB_PUSH_VAPID_PUBLIC_KEY', 'WEB_PUSH_VAPID_PRIVATE_KEY']) delete process.env[key];
  const { default: router } = await import('../dist/routes/orders.js');
  const { createOrderStatusToken, canReadOrderContact } = await import('../dist/utils/orderStatusToken.js');
  const { signToken, verifyAdminToken } = await import('../dist/middleware/auth.js');
  const { getStripe } = await import('../dist/services/stripeClient.js');
  let checkout;
  t.mock.method(getStripe().checkout.sessions, 'create', async params => {
    checkout = params;
    return { id: 'cs_isolated', url: 'https://checkout.example.invalid/session' };
  });
  t.mock.method(getStripe().checkout.sessions, 'retrieve', async () => ({
    id: 'cs_isolated', metadata: checkout.metadata, payment_status: 'paid',
    amount_total: checkout.line_items.reduce((sum, item) => sum + item.quantity * item.price_data.unit_amount, 0),
  }));
  const app = express();
  app.use(express.json());
  app.use('/orders', router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/orders`;
  const request = (path, method = 'GET', body, token) => fetch(base + path, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Order-Token': token } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const payload = () => ({ items: [{ productId: plain, productName: 'Forged name', price: 1, quantity: 2,
    modifications: ['Synthetic personal instruction'] }],
    orderType: 'delivery', paymentMethod: 'card',
    customerInfo: { name: 'Anna Test', phone: '0000000000', email: 'anna@example.invalid' },
    deliveryInfo: { address: 'Testgatan 1', postalCode: '00000', city: 'Teststad' },
    deliveryQuote: { feeOre: 9950, matchedCity: null, showDeliveryEstimate: true } });
  let order;
  try {
    await t.test('valid checkout keeps customer delivery details, server prices and stored instructions', async () => {
      const response = await request('/', 'POST', payload());
      assert.equal(response.status, 201);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      order = await response.json();
      assert.equal(order.totalPrice, 19950);
      assert.equal(order.items[0].productName, 'Kunafa');
      assert.equal(order.items[0].price, 5000);
      assert.equal(order.deliveryInfo.address, 'Testgatan 1');
      assert.equal(order.customerInfo.phone, '0000000000');
      assert.ok(canReadOrderContact(order.id, order.statusToken));
      assert.deepEqual(items[0].modifications_json, ['Synthetic personal instruction']);
      assert.equal(orders[0].customer_email, 'anna@example.invalid');
      orders[0].internal_notes = 'Synthetic staff-only note';
    });
    await t.test('legacy links retain status and pricing but expose no contact, free text or internal notes', async () => {
      for (const token of [undefined, 'forged', createOrderStatusToken('another-order', new Date()),
        jwt.sign({}, secret, { algorithm: 'HS256', audience: 'order-status', subject: order.id, expiresIn: -1 }),
        jwt.sign({}, secret, { algorithm: 'HS384', audience: 'order-status', subject: order.id, expiresIn: 60 }),
        jwt.sign({}, secret, { algorithm: 'HS256', audience: 'wrong-purpose', subject: order.id, expiresIn: 60 }),
        signToken({ adminId: 'owner', email: 'owner@example.invalid' })]) {
        const response = await request(`/${order.id}`, 'GET', undefined, token);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        const status = await response.json();
        assert.equal(status.totalPrice, order.totalPrice);
        assert.equal(status.orderNumber, order.orderNumber);
        assert.deepEqual(status.deliveryInfo, { pricing: payload().deliveryQuote });
        for (const field of ['customerInfo', 'internalNotes', 'statusToken']) assert.equal(Object.hasOwn(status, field), false);
        assert.equal(Object.hasOwn(status.items[0], 'modifications'), false);
        for (const privateText of ['Anna Test', '0000000000', 'anna@example.invalid', 'Testgatan 1', 'staff-only', 'personal instruction']) {
          assert.equal(JSON.stringify(status).includes(privateText), false);
        }
      }
    });
    await t.test('customer access is scoped, expires, survives preorder lead time and grants no admin access', async () => {
      const response = await request(`/${order.id}`, 'GET', undefined, order.statusToken);
      const own = await response.json();
      assert.equal(own.deliveryInfo.address, 'Testgatan 1');
      assert.equal(own.customerInfo.name, 'Anna Test');
      assert.equal(own.customerInfo.email, undefined);
      assert.equal(own.internalNotes, undefined);
      assert.equal(verifyAdminToken(order.statusToken), null);
      const scheduled = new Date('2099-01-01T12:00:00Z');
      const future = jwt.decode(createOrderStatusToken('preorder', scheduled));
      assert.ok(future.exp >= scheduled.getTime() / 1000 + 7 * 86400 - 1);
      process.env.JWT_SECRET = '';
      assert.equal(canReadOrderContact(order.id, order.statusToken), false);
      assert.equal(createOrderStatusToken(order.id, new Date()), undefined);
      process.env.JWT_SECRET = secret;
    });
    await t.test('admin history keeps contact, internal notes and modifications', async () => {
      orders[0].status = 'klar';
      const response = await fetch(`${base}/admin/history`, { headers: {
        Authorization: `Bearer ${signToken({ adminId: 'owner', email: 'owner@example.invalid' })}`,
      } });
      assert.equal(response.status, 200);
      const [adminOrder] = await response.json();
      assert.equal(adminOrder.internalNotes, 'Synthetic staff-only note');
      assert.equal(adminOrder.customerInfo.email, 'anna@example.invalid');
      assert.equal(adminOrder.deliveryInfo.address, 'Testgatan 1');
      assert.deepEqual(adminOrder.items[0].modifications, ['Synthetic personal instruction']);
      orders[0].status = 'ny';
    });
    await t.test('unknown, hidden, malformed or invalid lines are rejected before any write', async () => {
      const before = writes;
      const line = payload().items[0];
      const invalid = [{ items: undefined }, { items: {} }, { items: [null] }, { orderType: 'invalid' },
        ...[0, -1, 1.5, '2', null, undefined, 101, 1e100].map(quantity => ({ items: [{ ...line, quantity }] })),
        ...['non-catalog-item', '33333333-3333-4333-8333-333333333333', `${plain}junk`, `${plain}-`, `${plain}-1 kg`, `${variant}-unknown`, `${variant}-toString`, variant, `${bread}-0 st`]
          .map(productId => ({ items: [{ ...line, productId }] })),
        { items: [{ ...line, modifications: 'invalid' }] }, { items: [{ ...line, modifications: [null] }] },
        { items: Array.from({ length: 101 }, () => line) }];
      for (const change of invalid) {
        const response = await request('/', 'POST', change === null ? null : { ...payload(), ...change });
        assert.equal(response.status, 400, JSON.stringify(change));
      }
      products[0].hidden = true;
      assert.equal((await request('/', 'POST', payload())).status, 400);
      products[0].hidden = false;
      products[0].price_ore = Number.MAX_SAFE_INTEGER;
      assert.equal((await request('/', 'POST', payload())).status, 400);
      products[0].price_ore = 5000;
      catalogUnavailable = true;
      assert.equal((await request('/', 'POST', payload())).status, 500);
      catalogUnavailable = false;
      assert.equal(writes, before);
    });
    await t.test('weight, persons, fixed packs, bread and pickup retain their names and prices', async () => {
      for (const [productId, expectedName, quantity, price] of [
        [`${variant}-2 personer`, 'Portionskunafa - 2 personer', 2, 14900],
        [`${variant}-500 gram`, 'Portionskunafa - 500 gram', 1, 12900],
        [`${bread}-3 st`, 'Bröd - 3 st', 6, 1500],
        [`${box}-1 kg`, 'Mormorsbox - 1 kg', 1, 29900],
        [`${mix}-1350 gram`, 'Pistagemix - 1350 gram', 1, 49900],
      ]) {
        const response = await request('/', 'POST', { ...payload(), items: [{ productId, productName: 'forged', price: 1, quantity }] });
        assert.equal(response.status, 201);
        const created = await response.json();
        assert.equal(created.items[0].productName, expectedName);
        assert.equal(created.totalPrice, quantity * price + 9950);
      }
      const scheduledTime = '2099-01-01T12:00:00';
      for (const orderType of ['takeaway', 'eat-here']) {
        const response = await request('/', 'POST', { ...payload(), orderType, locationId: 'pickup', scheduledTime });
        assert.equal(response.status, 201);
        const pickup = await response.json();
        assert.equal(pickup.totalPrice, 10000);
        assert.equal(pickup.locationId, 'pickup');
        assert.equal(pickup.scheduledTime, pickup.estimatedReadyTime);
        assert.equal(pickup.deliveryInfo, undefined);
      }
    });
    await t.test('Stripe return preserves only a valid customer token and confirm cannot leak admin data', async () => {
      const response = await request(`/checkout-session/${order.id}`, 'POST', {}, order.statusToken);
      assert.equal(response.status, 200);
      assert.equal(new URL(checkout.success_url).searchParams.get('session_id'), '{CHECKOUT_SESSION_ID}');
      const returnedToken = new URLSearchParams(new URL(checkout.success_url).hash.slice(1)).get('statusToken');
      assert.equal(returnedToken, order.statusToken);
      const confirmation = await request('/stripe-confirm', 'POST', { orderId: order.id, sessionId: 'cs_isolated' }, returnedToken);
      assert.equal(confirmation.status, 200);
      const paid = await confirmation.json();
      assert.equal(paid.paymentStatus, 'paid');
      assert.equal(paid.deliveryInfo.address, 'Testgatan 1');
      assert.equal(paid.internalNotes, undefined);
      const withoutToken = await request('/stripe-confirm', 'POST', { orderId: order.id, sessionId: 'cs_isolated' });
      assert.equal(withoutToken.headers.get('cache-control'), 'no-store');
      const publicPaid = await withoutToken.json();
      assert.equal(publicPaid.customerInfo, undefined);
      assert.equal(publicPaid.internalNotes, undefined);
      assert.equal(publicPaid.deliveryInfo.address, undefined);
      const other = orders.find(row => row.id !== order.id);
      for (const token of [undefined, order.statusToken]) {
        assert.equal((await request(`/checkout-session/${other.id}`, 'POST', {}, token)).status, 200);
        assert.equal(new URL(checkout.success_url).hash, '');
      }
    });
  } finally {
    server.closeAllConnections(); database.closeAllConnections();
    await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => database.close(resolve))]);
  }
});
