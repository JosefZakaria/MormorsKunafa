import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';

const ashtaId = 'd1671a64-2ae3-407a-b9cc-e417678f26f0';
const trayId = 'bf8ec400-450b-4726-bc58-d2b6a53a28a6';
const groundId = '77048580-fd68-454d-b34b-395b351a96d4';

test('voice catalog reads current prices and location stock with separate access control', async t => {
  const secret = 'isolated-voice-catalog-secret-for-tests';
  const ashta = {
    id: ashtaId, hidden: true, stock_status: 'instock', price_ore: 17900,
    variant_prices: { '3 personer': 17900, '6 personer': 29900 },
  };
  const products = [
    ashta,
    { id: trayId, hidden: true, stock_status: 'outofstock', price_ore: 100000,
      variant_prices: { 'Malen med ost · 25 personer': 100000, 'Krispig med ost · 25 personer': 100000 } },
    { id: groundId, name: 'Malen kunafa', hidden: false, stock_status: 'instock', price_ore: 14900,
      variant_prices: { '2 personer': 14900 } },
    { id: 'baklawa', name: 'Baklawa', hidden: false, stock_status: 'instock', price_ore: 9900,
      variant_prices: { '250 gram': 9900, '500 gram': 18900 } },
    { id: 'other-hidden', name: 'Hidden product', hidden: true },
  ];
  const locations = [
    { id: 'location-1', slug: 'hoja', name: 'Höja', address: 'Karolingatan 1' },
    { id: 'location-2', slug: 'mollevangen', name: 'Möllevången', address: 'Bergsgatan 35' },
  ];
  const stock = [
    { product_id: ashtaId, location_id: 'location-1', in_stock: true },
    { product_id: trayId, location_id: 'location-1', in_stock: true },
    { product_id: trayId, location_id: 'location-2', in_stock: true },
    { product_id: groundId, location_id: 'location-2', in_stock: false },
  ];
  let lookups = 0;
  let stockLookupFails = false;
  const database = createServer((req, res) => {
    assert.equal(req.method, 'GET');
    lookups++;
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Content-Type', 'application/json');
    switch (url.pathname) {
      case '/rest/v1/products': {
        const publicMenu = url.searchParams.get('hidden') === 'eq.false';
        if (!publicMenu) assert.equal(url.searchParams.get('or'), `(hidden.eq.false,id.in.(${ashtaId},${trayId}))`);
        res.end(JSON.stringify(publicMenu ? products.filter(product => !product.hidden) : products));
        break;
      }
      case '/rest/v1/locations':
        res.end(JSON.stringify(locations));
        break;
      case '/rest/v1/product_location_stock':
        if (stockLookupFails) {
          res.statusCode = 400;
          res.end(JSON.stringify({ code: 'XX000', message: 'Isolated stock lookup failed' }));
        } else {
          res.end(JSON.stringify(stock));
        }
        break;
      default:
        res.statusCode = 404;
        res.end('{}');
    }
  }).listen(0, '127.0.0.1');
  t.after(() => database.close());
  await once(database, 'listening');
  process.env.NODE_ENV = 'production';
  process.env.SUPABASE_URL = `http://127.0.0.1:${database.address().port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolated-voice-catalog-test-only';
  process.env.VOICE_AGENT_API_KEY = '';

  const { default: app } = await import('../dist/index.js');
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const requestCatalog = authorization => fetch(`${base}/api/voice/catalog`, {
    headers: authorization ? { Authorization: authorization } : {},
  });
  const bearer = `Bearer ${secret}`;
  assert.equal((await requestCatalog(bearer)).status, 503);
  process.env.VOICE_AGENT_API_KEY = secret;
  assert.equal((await requestCatalog()).status, 401);
  assert.equal((await requestCatalog(`Bearer ${secret}-wrong`)).status, 401);
  assert.equal(lookups, 0);

  const response = await requestCatalog(bearer);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const catalog = await response.json();
  assert.equal(catalog.currency, 'SEK');
  assert.deepEqual(catalog.locations, locations);
  assert.deepEqual(catalog.products.map(product => product.id), [ashtaId, trayId, groundId, 'baklawa']);
  const [ashtaProduct, trayProduct, groundProduct, baklawaProduct] = catalog.products;
  assert.deepEqual(ashtaProduct.options.map(({ persons, priceOre }) => [persons, priceOre]), [[3, 17900], [6, 29900]]);
  assert.deepEqual(ashtaProduct.stockByLocation, { 'location-1': true, 'location-2': false });
  assert.equal(trayProduct.pickupLocationSlug, 'hoja');
  assert.equal(trayProduct.minimumLeadMinutes, 120);
  assert.deepEqual(trayProduct.options.map(({ persons, priceOre }) => [persons, priceOre]), [[25, 100000], [25, 100000]]);
  assert.deepEqual(trayProduct.stockByLocation, { 'location-1': true, 'location-2': false });
  assert.deepEqual(groundProduct.stockByLocation, { 'location-1': true, 'location-2': false });
  assert.deepEqual(groundProduct.options.map(option => option.priceOre), [14900, null]);
  assert.deepEqual(baklawaProduct.options.map(option => option.priceOre), [9900, 18900]);

  const publicMenu = await (await fetch(`${base}/api/products`)).json();
  assert.deepEqual(publicMenu.map(product => product.id), [groundId, 'baklawa']);

  ashta.variant_prices['6 personer'] = 31900;
  const updated = await (await requestCatalog(bearer)).json();
  assert.equal(updated.products.find(product => product.id === ashtaId).options[1].priceOre, 31900);

  stockLookupFails = true;
  const unavailable = await requestCatalog(bearer);
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: 'Voice catalog unavailable' });
});
