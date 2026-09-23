import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';

test('owner delivery pricing API (isolated database stub, no live credentials)', async (t) => {
  let row = { id: 'settings', delivery_default_fee_ore: 7900, delivery_city_fees: [{ city: 'Lund', feeOre: 11900 }], is_paused: true };
  let failure = false;
  let writeFailure = false;
  let missingColumns = false;
  let writes = 0;
  const database = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/rest/v1/admin_users') {
      const location = url.searchParams.get('id') === 'eq.location-admin';
      res.end(JSON.stringify([{ id: location ? 'location-admin' : 'owner', role: location ? 'location' : 'owner', location_id: null }]));
      return;
    }
    assert.equal(url.pathname, '/rest/v1/admin_settings');
    if (failure || missingColumns || (writeFailure && req.method === 'PATCH')) {
      res.statusCode = 400;
      res.end(JSON.stringify({ code: missingColumns ? '42703' : 'XX000', message: 'Simulated database failure' }));
      return;
    }
    if (req.method === 'PATCH') {
      assert.equal(url.searchParams.get('id'), 'eq.settings');
      let body = '';
      for await (const chunk of req) body += chunk;
      const patch = JSON.parse(body);
      assert.deepEqual(Object.keys(patch).sort(), ['delivery_city_fees', 'delivery_default_fee_ore', 'updated_at']);
      row = { ...row, ...patch };
      writes++;
    }
    const wantsObject = req.headers.accept?.includes('application/vnd.pgrst.object+json');
    res.end(JSON.stringify(wantsObject ? row : row ? [row] : []));
  }).listen(0, '127.0.0.1');
  await once(database, 'listening');
  process.env.SUPABASE_URL = `http://127.0.0.1:${database.address().port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-test-key';
  process.env.JWT_SECRET = 'local-delivery-pricing-test-only';
  const { default: router } = await import('../dist/routes/adminDeliveryPricing.js');
  const { signToken } = await import('../dist/middleware/auth.js');
  const app = express();
  app.use(express.json());
  app.use('/api/admin/delivery-pricing', router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/admin/delivery-pricing`;
  const owner = signToken({ adminId: 'owner', email: 'test@example.invalid', role: 'owner' });
  // Deliberately stale owner claim: the live database role must win.
  const location = signToken({ adminId: 'location-admin', email: 'test@example.invalid', role: 'owner' });
  const request = (method = 'GET', body, token = owner) => fetch(url, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try {
    await t.test('anonymous and location accounts cannot read or change prices', async () => {
      for (const token of ['', location]) {
        for (const method of ['GET', 'PATCH']) {
          const response = await request(method, method === 'PATCH' ? { defaultFeeOre: 0, cityFees: [] } : undefined, token);
          assert.equal(response.status, token ? 403 : 401);
        }
      }
      assert.equal(writes, 0);
    });
    await t.test('owner reads saved prices', async () => {
      const response = await request();
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { defaultFeeOre: 7900, cityFees: [{ city: 'Lund', feeOre: 11900 }] });
    });
    await t.test('owner changes national and city prices without overwriting other settings', async () => {
      const response = await request('PATCH', {
        defaultFeeOre: 9950, cityFees: [{ city: ' Malmö ', feeOre: 0 }, { city: 'Göteborg', feeOre: 15900 }], is_paused: false,
      });
      assert.equal(response.status, 200);
      const saved = await response.json();
      assert.deepEqual(saved, { defaultFeeOre: 9950, cityFees: [{ city: 'Malmö', feeOre: 0 }, { city: 'Göteborg', feeOre: 15900 }] });
      assert.deepEqual(await (await request()).json(), saved);
      assert.equal(row.is_paused, true);
    });
    await t.test('invalid settings and duplicate cities return 400 without writes', async () => {
      const before = writes;
      for (const body of [
        {}, { defaultFeeOre: -1, cityFees: [] }, { defaultFeeOre: 79.5, cityFees: [] },
        { defaultFeeOre: 7900, cityFees: [{ city: ' ', feeOre: 7900 }] },
        { defaultFeeOre: 7900, cityFees: [{ city: 'Lund', feeOre: 11900 }, { city: ' LUND ', feeOre: 9900 }] },
      ]) assert.equal((await request('PATCH', body)).status, 400);
      assert.equal(writes, before);
    });
    await t.test('all city overrides can be removed', async () => {
      assert.equal((await request('PATCH', { defaultFeeOre: 7900, cityFees: [] })).status, 200);
      assert.deepEqual(await (await request()).json(), { defaultFeeOre: 7900, cityFees: [] });
    });
    await t.test('missing migration gives an actionable error', async () => {
      missingColumns = true;
      const response = await request();
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /migration/i);
      missingColumns = false;
    });
    await t.test('database errors do not report a successful save', async () => {
      const before = writes;
      const previous = structuredClone(row);
      failure = true;
      assert.equal((await request('PATCH', { defaultFeeOre: 0, cityFees: [] })).status, 500);
      failure = false;
      writeFailure = true;
      assert.equal((await request('PATCH', { defaultFeeOre: 0, cityFees: [] })).status, 500);
      writeFailure = false;
      assert.equal(writes, before);
      assert.deepEqual(row, previous);
    });
    await t.test('missing settings row is not silently replaced by defaults', async () => {
      row = null;
      assert.equal((await request()).status, 404);
      assert.equal((await request('PATCH', { defaultFeeOre: 0, cityFees: [] })).status, 404);
    });
  } finally {
    server.closeAllConnections();
    database.closeAllConnections();
    await Promise.all([new Promise((resolve) => server.close(resolve)), new Promise((resolve) => database.close(resolve))]);
  }
});
