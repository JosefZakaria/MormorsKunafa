// Production web bundle, synthetic API responses only. All external traffic is blocked.
const assert = require('node:assert/strict');
const {before, after, test} = require('node:test');
const {spawn} = require('node:child_process');
const {existsSync, mkdirSync} = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const ORIGIN = 'http://127.0.0.1:4175';
let browser, server;
before(async () => {
  const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
  server = spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', '4175', '--strictPort'], {cwd: path.resolve(__dirname, '..'), stdio: 'ignore'});
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {if ((await fetch(ORIGIN)).ok) {ready = true; break;}} catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(ready, 'Vite preview must start');
  const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const executablePath = process.env.TEST_BROWSER_PATH || (existsSync(chrome) ? chrome : undefined);
  browser = await chromium.launch({...(executablePath ? {executablePath} : {})});
});
after(async () => {await browser?.close(); server?.kill();});

async function setup(t, role = 'owner', closed = false) {
  const context = await browser.newContext({serviceWorkers: 'block'});
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [], calls = [], holds = [];
  const state = {failPreview: false, erased: false, historyCalls: 0};
  page.on('pageerror', error => errors.push(error.message));
  const location = {id: 'location-fixture', slug: 'hoja', name: 'Test location', takeawayEnabled: true, eatHereEnabled: true};
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === ORIGIN && !url.pathname.startsWith('/api/')) return route.continue();
    if (url.origin !== ORIGIN) return route.abort();
    const endpoint = url.pathname.replace(/^\/api/, '');
    const json = (body, status = 200) => route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)});
    if (endpoint === '/admin/session') return json({csrfToken: 'fixture-csrf', admin: {id: 'owner-fixture', name: 'Synthetic owner', email: 'owner@example.invalid', role, locationId: role === 'owner' ? null : location.id}});
    if (endpoint === '/admin/realtime-token') return json({error: 'Unavailable in test'}, 503);
    if (endpoint === '/admin/settings' || endpoint === '/orders/settings') return json({defaultPreparationTime: 30, isPaused: false, locations: [location]});
    if (endpoint === '/locations') return json([location]);
    if (endpoint === '/orders/admin/history') {state.historyCalls++; return json([]);}
    if (endpoint === '/products' || ['/orders/admin/pending','/orders/admin/active','/orders/admin/pre-orders'].includes(endpoint)) return json([]);
    if (endpoint === '/orders/admin/retention-preview') {
      calls.push({method: request.method(), endpoint, page: url.searchParams.get('page')});
      if (state.failPreview) return json({error: 'Synthetic preview unavailable'}, 503);
      const pageNumber = Number(url.searchParams.get('page'));
      return json({readOnly: true, generatedAt: new Date().toISOString(), page: pageNumber, pageSize: 50, total: 51,
        orders: [{id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', version: 'fixture-version', orderNumber: pageNumber === 1 ? '#PREVIEW-1' : '#PREVIEW-2', status: closed ? 'klar' : 'ny', paymentStatus: closed ? 'paid' : 'pending', createdAt: '2020-01-01T12:00:00Z', holds,
          decisions: [...(state.erased ? [] : [{field: 'contact', status: holds.some(hold => !hold.releasedAt) ? 'hold' : closed ? 'review' : 'candidate', rule: closed ? 'contact_up_to_3_years' : 'abandoned_30_days', reason: 'Synthetic retention rule', ...(!closed ? {eligibleFrom: '2026-11-17T12:00:00Z'} : {})}]),
            {field: 'purchase_details', status: 'preserve', rule: 'accounting_calendar_year', reason: 'Synthetic accounting protection', eligibleFrom: '2034-01-01'}]}]});
    }
    if (endpoint.endsWith('/retention-erase') && request.method() === 'POST') {
      const body = request.postDataJSON();
      calls.push({method: request.method(), endpoint, body, csrf: request.headers()['x-csrf-token']});
      state.erased = true;
      return json({runId: 'synthetic-run', orderId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fields: body.fields, performedAt: new Date().toISOString()});
    }
    if (endpoint.endsWith('/retention-holds') && request.method() === 'POST') {
      const body = request.postDataJSON();
      calls.push({method: request.method(), endpoint, body, csrf: request.headers()['x-csrf-token']});
      const hold = {id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', orderId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ...body, responsibleName: 'Synthetic owner', createdAt: new Date().toISOString(), releasedAt: null};
      holds.push(hold); return json(hold, 201);
    }
    if (endpoint.endsWith('/release') && request.method() === 'PATCH') {
      calls.push({method: request.method(), endpoint, csrf: request.headers()['x-csrf-token']});
      holds[0].releasedAt = new Date().toISOString(); return json({ok: true});
    }
    return route.abort();
  });
  await page.goto(`${ORIGIN}/admin/dashboard`);
  await page.getByRole('button', {name: 'Logga ut'}).waitFor();
  return {page, calls, holds, state, errors};
}

test('owner verifies, manages exceptions and explicitly erases selected customer fields', async t => {
  const {page, calls, holds, errors, state} = await setup(t);
  await page.getByRole('button', {name: 'Orderhistorik', exact: true}).click();
  assert.equal(calls.length, 0, 'Opening history must not scan Stripe automatically');
  await page.getByRole('button', {name: 'Visa gallringskontroll', exact: true}).click();
  await page.getByRole('button', {name: 'Hämta kontroll', exact: true}).click();
  const article = page.getByRole('article', {name: 'Gallringsbedömning #PREVIEW-1'});
  await article.waitFor();
  await article.getByText('Regler och bedömning', {exact: true}).click();
  assert.match(await article.innerText(), /Förslag att gallra/);
  await article.getByText('Registrera pågående ärende', {exact: true}).click();
  await article.getByRole('checkbox', {name: 'Telefon och e-post', exact: true}).check();
  await article.getByRole('button', {name: 'Spara undantag'}).click();
  await page.getByText('Pågående undantag', {exact: true}).waitFor();
  assert.deepEqual(holds[0].fields, ['contact']);
  assert.equal(calls.find(call => call.method === 'POST').csrf, 'fixture-csrf');
  await article.getByText('Regler och bedömning', {exact: true}).click();
  assert.match(await article.innerText(), /Undantagen/);
  assert.match(await article.innerText(), /Order, orderrader och produktanpassningar — Bevaras/);
  page.once('dialog', dialog => dialog.accept());
  await article.getByRole('button', {name: 'Avsluta undantag'}).click();
  await page.getByText('Avslutat undantag', {exact: true}).waitFor();
  assert(holds[0].releasedAt);
  await article.getByText('Gallra valda kunduppgifter', {exact: true}).click();
  const erasure = article.getByRole('form', {name: 'Gallra kunduppgifter'});
  await erasure.getByRole('checkbox', {name: 'Telefon och e-post', exact: true}).check();
  assert.equal(await erasure.getByRole('button', {name: 'Gallra valda uppgifter', exact: true}).isDisabled(), true);
  await erasure.getByRole('checkbox', {name: /Jag bekräftar att valda uppgifter/}).check();
  const historyBefore = state.historyCalls;
  const historyReloaded = page.waitForResponse(response => new URL(response.url()).pathname === '/api/orders/admin/history');
  page.once('dialog', dialog => dialog.accept());
  await erasure.getByRole('button', {name: 'Gallra valda uppgifter', exact: true}).click();
  await page.getByRole('status').filter({hasText: 'Gallringen är utförd'}).waitFor();
  await historyReloaded;
  assert(state.historyCalls > historyBefore, 'Cached history must be discarded and reloaded after erasure');
  assert.equal(calls.find(call => call.endpoint.endsWith('/retention-erase')).csrf, 'fixture-csrf');
  assert.deepEqual(calls.find(call => call.endpoint.endsWith('/retention-erase')).body.fields, ['contact']);
  assert.equal(calls.find(call => call.endpoint.endsWith('/retention-erase')).body.version, 'fixture-version');
  assert.equal(await article.getByText('Gallra valda kunduppgifter', {exact: true}).count(), 0);
  await page.getByRole('button', {name: 'Nästa sida', exact: true}).click();
  await page.getByRole('article', {name: 'Gallringsbedömning #PREVIEW-2'}).waitFor();
  assert.equal(calls.filter(call => call.endpoint.endsWith('/retention-preview')).at(-1).page, '2');
  await page.getByRole('button', {name: 'Föregående sida', exact: true}).click();
  await article.waitFor();
  mkdirSync(path.resolve(__dirname, '../../../.cache/retention-preview'), {recursive: true});
  await page.screenshot({path: path.resolve(__dirname, '../../../.cache/retention-preview/desktop.png'), fullPage: true});
  await page.setViewportSize({width: 390, height: 844});
  await page.screenshot({path: path.resolve(__dirname, '../../../.cache/retention-preview/mobile.png'), fullPage: true});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'Mobile view must not overflow horizontally');
  state.failPreview = true;
  await page.getByRole('button', {name: 'Kontrollera på nytt'}).click();
  await page.getByRole('alert').filter({hasText: 'Synthetic preview unavailable'}).waitFor();
  assert.equal(await page.getByRole('article', {name: /Gallringsbedömning/}).count(), 0, 'Failed refresh must hide stale proposals');
  assert.equal(calls.some(call => call.method === 'DELETE'), false);
  assert.deepEqual(errors, []);
});

test('location accounts have no history or retention interface', async t => {
  const {page, calls, errors} = await setup(t, 'location');
  assert.equal(await page.getByRole('button', {name: 'Orderhistorik', exact: true}).count(), 0);
  assert.equal(await page.getByRole('heading', {name: 'Gallring', exact: true}).count(), 0);
  assert.equal(calls.length, 0);
  assert.deepEqual(errors, []);
});

test('individual earlier erasure requires a real closure date and explicit purpose-ended selection', async t => {
  const {page, calls} = await setup(t, 'owner', true);
  await page.getByRole('button', {name: 'Orderhistorik', exact: true}).click();
  await page.getByRole('button', {name: 'Visa gallringskontroll', exact: true}).click();
  await page.getByRole('button', {name: 'Hämta kontroll', exact: true}).click();
  const article = page.getByRole('article', {name: 'Gallringsbedömning #PREVIEW-1'});
  await article.getByText('Gallra valda kunduppgifter', {exact: true}).click();
  const form = article.getByRole('form', {name: 'Gallra kunduppgifter'});
  await form.getByRole('checkbox', {name: 'Telefon och e-post', exact: true}).check();
  await form.getByRole('checkbox', {name: /Jag bekräftar att valda uppgifter/}).check();
  assert.equal(await form.getByRole('button', {name: 'Gallra valda uppgifter'}).isDisabled(), true);
  await form.getByLabel(/Bekräftat avslutsdatum/).fill('2026-11-16');
  await form.getByRole('checkbox', {name: /Individuell bedömning/}).check();
  page.once('dialog', dialog => dialog.accept());
  await form.getByRole('button', {name: 'Gallra valda uppgifter'}).click();
  await page.getByRole('status').filter({hasText: 'Gallringen är utförd'}).waitFor();
  const call = calls.find(call => call.endpoint.endsWith('/retention-erase'));
  assert.equal(call.body.closedOn, '2026-11-16');
  assert.equal(call.body.purposeEnded, true);
  assert.equal(call.body.confirmedNoAccountingNeed, true);
});
