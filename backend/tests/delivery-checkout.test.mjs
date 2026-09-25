import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';

test('delivery checkout uses saved settings and freezes server-calculated terms', async (t) => {
  let settings = { id: 'settings', default_preparation_time_minutes: 30,
    delivery_default_fee_ore: 9950, delivery_city_fees: [{ city: 'Lund', feeOre: 11900 }] };
  let unavailable = false;
  const orders = [];
  const items = [];
  const productId = '11111111-1111-4111-8111-111111111111';
  const database = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url, 'http://localhost');
    const table = url.pathname.split('/').at(-1);
    let body = '';
    for await (const chunk of req) body += chunk;
    const data = body ? JSON.parse(body) : undefined;
    let result;
    if (table === 'admin_settings') {
      if (unavailable && url.searchParams.get('select').includes('delivery_default_fee_ore')) {
        res.statusCode = 400;
        res.end(JSON.stringify({ code: '42703', message: 'Missing pricing columns' }));
        return;
      }
      result = [settings];
    } else if (table === 'orders') {
      if (req.method === 'POST') orders.push(data);
      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      result = id ? orders.filter((order) => order.id === id) : orders;
      if (req.method === 'PATCH') result.forEach((order) => Object.assign(order, data));
    } else if (table === 'order_items') {
      if (req.method === 'POST') items.push(...data);
      const id = url.searchParams.get('order_id')?.replace(/^eq\./, '');
      result = items.filter((item) => !id || item.order_id === id);
    } else if (table === 'products') {
      result = [{ id: productId, price_ore: 5000, in_stock: true, hidden: false }];
    } else if (table === 'product_location_stock') result = [];
    else if (table === 'locations') result = [{ id: 'pickup', name: 'Test', takeaway_enabled: true }];
    else {
      res.statusCode = 500;
      res.end(JSON.stringify({ message: `Unexpected test request: ${table}` }));
      return;
    }
    res.end(JSON.stringify(req.headers.accept?.includes('application/vnd.pgrst.object+json') ? result[0] ?? null : result));
  }).listen(0, '127.0.0.1');
  await once(database, 'listening');
  process.env.SUPABASE_URL = `http://127.0.0.1:${database.address().port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-checkout-test-only';
  process.env.JWT_SECRET = 'local-checkout-test-only';
  // No real payment, messaging, or printer services are used.
  delete process.env.RESEND_API_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  const { default: router } = await import('../dist/routes/orders.js');
  const app = express();
  app.use(express.json());
  app.use('/orders', router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/orders`;
  const quote = { feeOre: 11900, matchedCity: 'Lund', showDeliveryEstimate: false };
  const payload = () => ({
    items: [{ productId, productName: 'Kunafa', quantity: 2, price: 5000 },
      { productId: 'delivery-fee', productName: 'Leveransavgift', quantity: 1, price: 1 }],
    orderType: 'delivery', paymentMethod: 'card',
    customerInfo: { name: 'Test', phone: '0700000000' },
    deliveryInfo: { city: ' lUnD ', address: 'Testgatan 1', postalCode: '22222',
      pricing: { feeOre: 1, showDeliveryEstimate: true } },
    deliveryQuote: quote,
  });
  const post = (body) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    await t.test('public pricing contains only pricing and cannot be cached', async () => {
      const response = await fetch(`${base}/delivery-pricing`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), { defaultFeeOre: 9950, cityFees: [{ city: 'Lund', feeOre: 11900 }] });
    });
    await t.test('city fee, total and delivery terms use the server snapshot', async () => {
      const response = await post({ ...payload(), scheduledTime: '2030-01-01T12:00:00' });
      assert.equal(response.status, 201);
      const order = await response.json();
      assert.equal(order.totalPrice, 21900);
      assert.deepEqual(order.deliveryInfo.pricing, quote);
      assert.equal(order.scheduledTime, undefined);
      const feeLines = order.items.filter((item) => item.productName === 'Leveransavgift');
      assert.equal(feeLines.length, 1);
      assert.equal(feeLines[0].price, 11900);
    });
    await t.test('missing, forged or stale acknowledgement creates no order', async () => {
      const count = orders.length;
      for (const invalid of [undefined, { ...quote, feeOre: 1 }, { ...quote, showDeliveryEstimate: true }]) {
        const response = await post({ ...payload(), deliveryQuote: invalid });
        assert.equal(response.status, 409);
        assert.equal((await response.json()).code, 'DELIVERY_QUOTE_CHANGED');
      }
      settings.delivery_city_fees = [{ city: 'Lund', feeOre: 14900 }];
      const stale = await post(payload());
      assert.equal(stale.status, 409);
      assert.equal((await stale.json()).deliveryPricing.cityFees[0].feeOre, 14900);
      assert.equal(orders.length, count);
      assert.deepEqual(orders[0].delivery_info_json.pricing, quote);
      assert.equal(orders[0].total_ore, 21900);
    });
    await t.test('national fee preserves öre and the national estimate', async () => {
      const body = payload();
      body.deliveryInfo.city = 'Stockholm';
      body.deliveryQuote = { feeOre: 9950, matchedCity: null, showDeliveryEstimate: true };
      const response = await post(body);
      assert.equal(response.status, 201);
      const order = await response.json();
      assert.equal(order.totalPrice, 19950);
      assert.deepEqual(order.deliveryInfo.pricing, body.deliveryQuote);
    });
    await t.test('free city delivery and removal of city rule', async () => {
      settings.delivery_city_fees = [{ city: 'Lund', feeOre: 0 }];
      const body = { ...payload(), deliveryQuote: { ...quote, feeOre: 0 } };
      const free = await post(body);
      assert.equal(free.status, 201);
      assert.equal((await free.json()).totalPrice, 10000);
      settings.delivery_city_fees = [];
      assert.equal((await post(body)).status, 409);
      body.deliveryQuote = { feeOre: 9950, matchedCity: null, showDeliveryEstimate: true };
      const national = await post(body);
      assert.equal(national.status, 201);
      assert.deepEqual((await national.json()).deliveryInfo.pricing, body.deliveryQuote);
    });
    await t.test('invalid delivery addresses are rejected before creating an order', async () => {
      const count = orders.length;
      for (const info of [undefined, {}, { city: 42 }, { ...payload().deliveryInfo, address: ' ' }]) {
        assert.equal((await post({ ...payload(), deliveryInfo: info })).status, 400);
      }
      assert.equal(orders.length, count);
    });
    await t.test('missing pricing fails closed for delivery but does not block pickup', async () => {
      unavailable = true;
      const count = orders.length;
      assert.equal((await fetch(`${base}/delivery-pricing`)).status, 503);
      assert.equal((await post(payload())).status, 503);
      assert.equal(orders.length, count);
      const response = await post({ ...payload(), orderType: 'takeaway', locationId: 'pickup', scheduledTime: '2030-01-01T14:00:00' });
      assert.equal(response.status, 201);
      const order = await response.json();
      assert.equal(order.totalPrice, 10000);
      assert.equal(order.deliveryInfo, undefined);
    });
  } finally {
    server.closeAllConnections();
    database.closeAllConnections();
    await Promise.all([new Promise((resolve) => server.close(resolve)), new Promise((resolve) => database.close(resolve))]);
  }
});
