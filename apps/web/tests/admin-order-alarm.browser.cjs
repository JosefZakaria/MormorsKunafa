// Runs the production frontend in Chromium with real Web Audio. Every API and
// printer request is intercepted; no live orders, payments or devices are used.
const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');

const ORIGIN = 'http://127.0.0.1:4173';
const MOLLE = '2f1a9c4e-6b7d-4e8f-a901-b2c3d4e5f602';
const location = { id: MOLLE, slug: 'mollevangen', name: 'Möllevången', address: '', fulfillsDelivery: false, eatHereEnabled: true, takeawayEnabled: true, isPaused: false };
const settings = { defaultPreparationTime: 30, isPaused: false, eatHereEnabled: true, takeawayEnabled: true, deliveryEnabled: true, locations: [location], heroImageDesktop: '', heroImageMobile: '' };
let browser, server;
let serverOutput = '';

before(async () => {
  const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
  server = spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
    cwd: path.resolve(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', data => { serverOutput += data; });
  server.stderr.on('data', data => { serverOutput += data; });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(serverOutput);
    try { if ((await fetch(ORIGIN)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, serverOutput || 'Vite did not start');
  browser = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required'], ...(process.env.TEST_BROWSER_PATH ? { executablePath: process.env.TEST_BROWSER_PATH } : {}) });
});
after(async () => {
  await browser?.close();
  server?.kill();
});

function order(id = 'order-1') {
  const now = new Date().toISOString();
  return { id, orderNumber: '#' + id, items: [{ productId: 'fixture', productName: 'Test order', quantity: 1, price: 1000 }], totalPrice: 1000, orderType: 'takeaway', status: 'ny', defaultPreparationTime: 30, estimatedReadyTime: now, createdAt: now, updatedAt: now, refundStatus: 'none', paymentMethod: 'card', paymentStatus: 'paid', locationId: MOLLE };
}

async function setup(t, options = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const state = { pending: [], scheduled: [], active: [], prints: [], products: [], phoneRequests: [], pendingStatus: 200, secondaryStatus: 200, holdSecondary: false, releaseSecondary: null, pendingCalls: 0, holdPending: false, releasePending: null, ...options };
  t.after(async () => {
    state.releaseSecondary?.();
    state.releasePending?.();
    await context.close();
    assert.deepEqual(pageErrors, [], 'Unhandled browser errors');
  });
  await page.addInitScript(({ profile, printer, MOLLE }) => {
    localStorage.setItem('authToken', 'isolated-test-token');
    if (printer) localStorage.setItem('printer_ip_mollevangen', 'printer.example.test');
    if (profile === 'missing') localStorage.removeItem('adminInfo');
    else if (profile === 'malformed') localStorage.setItem('adminInfo', '{broken-json');
    else localStorage.setItem('adminInfo', JSON.stringify({ id: 'fixture-admin', email: 'fixture@example.invalid', name: 'Fixture', role: profile === 'owner' ? 'owner' : 'location', locationId: profile === 'owner' ? null : MOLLE }));
    window.__eventSources = [];
    class TestEventSource extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 2;
      readyState = 1;
      constructor() {
        super();
        window.__eventSources.push(this);
        queueMicrotask(() => { if (this.readyState === 1) this.onopen?.(new Event('open')); });
      }
      close() { this.readyState = 2; }
    }
    window.EventSource = TestEventSource;
    window.__alarmProbe = { contexts: [], analysers: [], sources: [] };
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args) { super(...args); window.__alarmProbe.contexts.push(this); }
      createBufferSource() {
        const source = super.createBufferSource();
        const record = { started: false, stopped: false, startedAt: null };
        window.__alarmProbe.sources.push(record);
        const start = source.start.bind(source);
        const stop = source.stop.bind(source);
        source.start = (...args) => { start(...args); record.started = true; record.startedAt = this.currentTime; };
        source.stop = (...args) => { stop(...args); record.stopped = true; };
        return source;
      }
      createGain() {
        const gain = super.createGain();
        const analyser = super.createAnalyser();
        analyser.fftSize = 2048;
        const silentSink = super.createGain();
        silentSink.gain.value = 0;
        gain.connect(analyser);
        analyser.connect(silentSink);
        silentSink.connect(this.destination);
        window.__alarmProbe.analysers.push(analyser);
        return gain;
      }
    };
    window.__alarmRms = () => Math.max(0, ...window.__alarmProbe.analysers.map(analyser => {
      const samples = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(samples);
      return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    }));
  }, { profile: options.profile || 'valid', printer: options.printer, MOLLE });

  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === ORIGIN && !url.pathname.startsWith('/api/')) return route.continue();
    const endpoint = url.pathname.replace(/^\/api/, '');
    const nowMs = state.nowMs ?? Date.now();
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (url.hostname === 'printer.example.test') {
      state.prints.push(route.request().postData());
      return route.fulfill({ contentType: 'text/xml', body: '<response success="true" />', headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    if (endpoint === '/orders/admin/pending') {
      state.pendingCalls += 1;
      const snapshot = [...state.pending, ...state.scheduled.filter(order => order.status === 'ny' && Date.parse(order.scheduledTime) - nowMs <= 20 * 60_000)];
      if (state.holdPending) {
        state.holdPending = false;
        await new Promise(resolve => { state.releasePending = resolve; });
      }
      return json(snapshot, state.pendingStatus);
    }
    if (endpoint === '/orders/admin/active' || endpoint === '/orders/admin/pre-orders') {
      if (state.holdSecondary) {
        await new Promise(resolve => {
          const previous = state.releaseSecondary;
          state.releaseSecondary = () => { previous?.(); resolve(); };
        });
      }
      return json(endpoint.endsWith('/active') ? state.active : state.scheduled.filter(order => order.status === 'ny' && Date.parse(order.scheduledTime) - nowMs > 20 * 60_000), state.secondaryStatus);
    }
    if (endpoint === '/admin/settings' || endpoint === '/orders/settings') return json(settings);
    if (endpoint === '/locations') return json([location]);
    if (endpoint === '/products') return json(state.products);
    if (endpoint === '/orders/admin/phone-orders' && route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      state.phoneRequests.push(body);
      const scheduledTime = body.scheduledTime ? new Date(body.scheduledTime + '+02:00').toISOString() : undefined;
      const created = { ...order(body.requestId), paymentMethod: 'pay_at_pickup', paymentStatus: 'pending', scheduledTime,
        estimatedReadyTime: scheduledTime ?? new Date(Date.now() + 30 * 60_000).toISOString() };
      if (scheduledTime) state.scheduled.push(created);
      else state.pending.push(created);
      return json(created, 201);
    }
    if (endpoint.endsWith('/time') && route.request().method() === 'PATCH') {
      const id = endpoint.split('/').at(-2);
      const activeOrder = state.active.find(order => order.id === id);
      if (!activeOrder) return json({ error: 'missing fixture' }, 404);
      activeOrder.estimatedReadyTime = route.request().postDataJSON().estimatedReadyTime;
      return json(activeOrder);
    }
    if (endpoint.endsWith('/accept') && route.request().method() === 'PATCH') {
      const id = endpoint.split('/').at(-2);
      const accepted = [...state.pending, ...state.scheduled].find(order => order.id === id);
      if (!accepted) return json({ error: 'missing fixture' }, 404);
      state.pending = state.pending.filter(order => order.id !== id);
      state.scheduled = state.scheduled.filter(order => order.id !== id);
      const extra = route.request().postDataJSON().extraMinutes ?? 0;
      const ready = new Date((accepted.scheduledTime ? Date.parse(accepted.scheduledTime) : Date.now() + 30 * 60_000) + extra * 60_000).toISOString();
      state.active.push({ ...accepted, status: 'mottagen', estimatedReadyTime: ready });
      return json(state.active.at(-1));
    }
    if (endpoint.startsWith('/orders/') && !endpoint.includes('/admin/')) {
      const id = endpoint.split('/').at(-1);
      const found = [...state.pending, ...state.scheduled, ...state.active].find(order => order.id === id);
      return found ? json(found) : json({ error: 'missing fixture' }, 404);
    }
    // Deny all non-fixture external traffic, including printer requests.
    return route.abort();
  });
  await page.goto(ORIGIN + '/admin/dashboard');
  await page.getByText('AKTIVERA LJUDET', { exact: true }).waitFor();
  return { page, state };
}

async function sound(page) {
  await page.waitForFunction(() => window.__alarmRms() > 0.05, null, { timeout: 8000 });
  const result = await page.evaluate(() => ({ rms: window.__alarmRms(), states: window.__alarmProbe.contexts.map(ctx => ctx.state) }));
  assert.ok(result.states.includes('running'), JSON.stringify(result));
}
async function silent(page) {
  await page.waitForFunction(() => !window.__alarmProbe.sources.some(source => source.started && !source.stopped) && window.__alarmRms() < 0.001, null, { timeout: 8000 });
}
async function activate(page) {
  await page.getByRole('button', { name: 'AKTIVERA', exact: true }).click();
  await sound(page);
  await page.getByRole('button', { name: 'Testa (2 s)', exact: true }).waitFor({ timeout: 8000 });
  await silent(page);
}
async function wake(page) {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}
async function overlay(page) {
  await page.locator('.alarm-overlay').waitFor({ timeout: 8000 });
}

test('admin countdown shows labelled units, crosses zero and preserves time adjustment controls', { timeout: 25000 }, async t => {
  const now = Date.parse('2026-10-19T12:00:00Z');
  const orderNumbers = { 'late-days': '#0375', 'late-one-day': '#0382', 'cross-zero': '#0390', 'cross-day': '#0391', 'unknown-time': '#0392' };
  const active = (id, offset) => ({ ...order(id), orderNumber: orderNumbers[id], status: 'mottagen', estimatedReadyTime: new Date(now + offset).toISOString() });
  const { page, state } = await setup(t, { active: [
    { ...active('late-days', -(2936 * 60 + 2) * 1000), orderType: 'delivery' },
    active('late-one-day', -(1460 * 60 + 51) * 1000),
    active('cross-zero', 1000),
    active('cross-day', 86400 * 1000),
    { ...active('unknown-time', 0), estimatedReadyTime: 'invalid' },
  ] });
  await page.clock.install({ time: now - 1000 });
  await page.clock.pauseAt(now);
  await page.getByRole('button', { name: /Aktiva Ordrar/ }).click();
  const card = id => page.locator('.admin-order-card').filter({ hasText: orderNumbers[id] });
  const expectTimer = async (id, text, overdue) => {
    const timer = card(id).locator('.order-timer');
    await timer.filter({ hasText: text }).waitFor();
    assert.equal((await timer.textContent()).replace(/\s+/g, ' ').trim(), text);
    assert.equal((await timer.getAttribute('class')).includes('timer-overdue'), overdue);
  };
  await expectTimer('late-days', '⏱ -2 dygn 0 H 56 M 2 S (SEN)', true);
  await expectTimer('late-one-day', '⏱ -1 dygn 0 H 20 M 51 S (SEN)', true);
  await expectTimer('cross-zero', '⏱ 1 S', false);
  await expectTimer('cross-day', '⏱ 1 dygn 0 H 0 M 0 S', false);
  await expectTimer('unknown-time', '⏱ --', false);

  await page.setViewportSize({ width: 375, height: 812 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'mobile layout overflows');
  await page.clock.runFor(1000);
  await expectTimer('cross-zero', '⏱ 0 S', false);
  await expectTimer('cross-day', '⏱ 23 H 59 M 59 S', false);
  await page.clock.runFor(1000);
  await expectTimer('cross-zero', '⏱ -1 S (SEN)', true);

  for (const [button, expected, offset] of [
    ['+5 min', '⏱ 4 M 59 S', 301000],
    ['−5 min', '⏱ -1 S (SEN)', 1000],
    ['+10 min', '⏱ 9 M 59 S', 601000],
  ]) {
    await card('cross-zero').getByRole('button', { name: button, exact: true }).click();
    await expectTimer('cross-zero', expected, offset === 1000);
    assert.equal(state.active.find(order => order.id === 'cross-zero').estimatedReadyTime, new Date(now + offset).toISOString());
  }
});

for (const profile of ['valid', 'missing', 'malformed']) {
  test('a paid order rings after the preview has ended (' + profile + ' admin profile)', { timeout: 25000 }, async t => {
    const { page, state } = await setup(t, { profile });
    await activate(page);
    state.pending = [order()];
    // No SSE event and no click: exercise the ordinary polling -> React -> audio path.
    await overlay(page);
    await sound(page);
    await page.getByRole('button', { name: /Visa ordrar.*pausa/ }).click();
    await silent(page);
    await page.getByRole('button', { name: /Acceptera/ }).first().click();
    await page.waitForFunction(() => !document.querySelector('.alarm-paused-banner'));
    await silent(page);
  });
}

test('a failed secondary API cannot prevent a paid order from ringing', { timeout: 25000 }, async t => {
  const { page, state } = await setup(t, { secondaryStatus: 500 });
  await activate(page);
  state.pending = [order()];
  await wake(page);
  await overlay(page);
  await sound(page);
});

test('a stalled secondary API cannot delay pending orders or later polling', { timeout: 25000 }, async t => {
  const { page, state } = await setup(t);
  await activate(page);
  state.holdSecondary = true;
  state.pending = [order()];
  await wake(page);
  await overlay(page);
  await sound(page);
  const calls = state.pendingCalls;
  await new Promise(resolve => setTimeout(resolve, 4000));
  assert.ok(state.pendingCalls > calls, 'pending polling stalled behind a secondary list');
  state.releaseSecondary?.();
});

test('an order arriving during a preview keeps ringing after the preview deadline', { timeout: 25000 }, async t => {
  const { page, state } = await setup(t);
  await page.getByRole('button', { name: 'AKTIVERA', exact: true }).click();
  await sound(page);
  state.pending = [order()];
  await wake(page);
  await overlay(page);
  await page.waitForTimeout(2500);
  await sound(page);
});

test('order alarm repeats two seconds of sound and seven seconds of silence, and stops during silence', { timeout: 35000 }, async t => {
  const { page, state } = await setup(t);
  await activate(page);
  state.pending = [order()];
  await wake(page);
  await overlay(page);
  await sound(page);
  const baseline = await page.evaluate(() => ({
    count: window.__alarmProbe.sources.length,
    start: window.__alarmProbe.sources.at(-1).startedAt,
  }));
  const at = async second => {
    await page.waitForFunction(({ start, second }) => window.__alarmProbe.contexts[0].currentTime - start >= second,
      { start: baseline.start, second }, { timeout: 10000 });
  };
  const expectSound = async second => {
    await at(second);
    // Wait through the brief gaps between the tones, but never into the next cycle.
    await page.waitForFunction(() => window.__alarmRms() > 0.05, null, { timeout: 400 });
  };
  const expectQuiet = async second => {
    await at(second);
    assert.ok(await page.evaluate(() => window.__alarmRms() < 0.001), `audio at ${second}s should be silent`);
    assert.equal(await page.evaluate(() => window.__alarmProbe.sources.length), baseline.count, 'the source restarted');
  };
  await expectSound(0.5);
  await expectSound(1.5);
  await expectQuiet(2.2);
  // Focus, clicks and another incoming order must preserve the scheduled silence.
  await wake(page);
  await page.evaluate(() => document.dispatchEvent(new Event('click')));
  state.pending.push(order('order-2'));
  await wake(page);
  await page.getByRole('heading', { name: '2 ordrar väntar!', exact: true }).waitFor();
  await expectQuiet(4.5);
  await expectQuiet(8.8);
  await expectSound(9.2);
  await expectSound(10.5);
  await expectQuiet(11.2);
  state.pending = [];
  await wake(page);
  await page.locator('.alarm-overlay').waitFor({ state: 'hidden' });
  await silent(page);
  // Crossing the next scheduled start must stay silent after the queue is cleared.
  await at(18.5);
  await silent(page);
  assert.equal(await page.evaluate(() => window.__alarmProbe.sources.length), baseline.count);
});

test('a new order interrupts a pause, failed polling preserves the alarm, and recovery clears it', { timeout: 30000 }, async t => {
  const { page, state } = await setup(t);
  await activate(page);
  state.pending = [order()];
  await wake(page);
  await overlay(page);
  await page.getByRole('button', { name: /Visa ordrar.*pausa/ }).click();
  await silent(page);
  state.pending.push(order('order-2'));
  await wake(page);
  await overlay(page);
  await sound(page);
  state.pendingStatus = 500;
  await wake(page);
  await page.waitForTimeout(300);
  await sound(page);
  state.pendingStatus = 200;
  state.pending = [];
  await wake(page);
  await page.locator('.alarm-overlay').waitFor({ state: 'hidden' });
  await silent(page);
});

test('polling discovers paid orders with hidden visibility and without any SSE event', { timeout: 30000 }, async t => {
  const { page, state } = await setup(t);
  await activate(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  state.pending = [order()];
  await overlay(page);
  await sound(page);
  // This exercises the hidden-page branch, not Android OS suspension.
});

test('an event during an old snapshot queues a follow-up instead of losing the new order', { timeout: 25000 }, async t => {
  const { page, state } = await setup(t);
  await activate(page);
  state.holdPending = true;
  await wake(page);
  for (let i = 0; i < 50 && !state.releasePending; i += 1) await page.waitForTimeout(20);
  assert.ok(state.releasePending, 'pending request was not held');
  state.pending = [order()];
  await page.evaluate(() => {
    const stream = window.__eventSources.at(-1);
    for (let i = 0; i < 10; i += 1) stream.dispatchEvent(new MessageEvent('ORDER_CREATED', { data: JSON.stringify({ event_id: 'event-' + i }) }));
  });
  state.releasePending();
  await overlay(page);
  await sound(page);
});

test('SSE reconnection immediately refreshes orders and restores event handlers', { timeout: 25000 }, async t => {
  const { page, state } = await setup(t);
  await activate(page);
  const streams = await page.evaluate(() => {
    window.__eventSources.at(-1).onerror(new Event('error'));
    return window.__eventSources.length;
  });
  await page.waitForFunction(count => window.__eventSources.length > count, streams);
  state.pending = [order()];
  await page.evaluate(() => window.__eventSources.at(-1).dispatchEvent(new MessageEvent('ORDER_CREATED', { data: JSON.stringify({ event_id: 'after-reconnect' }) })));
  await overlay(page);
  await sound(page);
});

test('expired authentication stops an active alarm and returns to login', { timeout: 25000 }, async t => {
  const { page, state } = await setup(t);
  await activate(page);
  state.pending = [order()];
  await wake(page);
  await overlay(page);
  await sound(page);
  state.pendingStatus = 401;
  await wake(page);
  await page.waitForURL('**/admin/login');
  await silent(page);
});

test('a waiting paid order alarms on initial load and again after reload', { timeout: 25000 }, async t => {
  const { page } = await setup(t, { profile: 'missing', pending: [order()] });
  await overlay(page);
  const activation = page.getByRole('button', { name: 'Aktivera orderljudet', exact: true });
  if (await activation.isVisible()) await activation.click();
  await sound(page);
  await page.reload();
  await overlay(page);
  if (await activation.isVisible()) await activation.click();
  await sound(page);
});

test('a pre-order moves automatically, rings on another tab, prints once and keeps pickup as its ready time', { timeout: 30000 }, async t => {
  const { page, state } = await setup(t, { printer: true });
  await activate(page);
  // Release after 2 seconds. This is deliberately before the next ordinary poll.
  const pickup = new Date(Date.now() + 20 * 60_000 + 2000).toISOString();
  state.scheduled = [{ ...order('scheduled'), scheduledTime: pickup, estimatedReadyTime: pickup }];
  await wake(page);
  await page.getByRole('button', { name: /Förbeställningar/ }).click();
  await page.locator('.preorder-card').waitFor();
  assert.equal(await page.locator('.pending-order-card').count(), 0);
  assert.equal(state.prints.length, 0);
  await silent(page);
  await overlay(page);
  await sound(page);
  await page.waitForFunction(() => !document.querySelector('.preorder-card'));
  for (let attempt = 0; attempt < 50 && state.prints.length === 0; attempt += 1) await page.waitForTimeout(20);
  assert.equal(state.prints.length, 1);
  await page.getByRole('button', { name: /Visa ordrar.*pausa/ }).click();
  await page.locator('.pending-order-card').waitFor();
  const clock = new Date(pickup).toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' });
  assert.equal(await page.locator('.pending-time-value').textContent(), clock);
  assert.equal(await page.locator('.pending-time-unit').textContent(), 'klartid');
  await wake(page);
  await page.waitForTimeout(300);
  assert.equal(state.prints.length, 1, 'refresh must not duplicate kitchen tickets');
  await page.getByRole('button', { name: 'Acceptera', exact: true }).click();
  await silent(page);
  assert.equal(state.active[0].estimatedReadyTime, pickup);
});

test('missed release during a failed request recovers on wake without an SSE event', { timeout: 25000 }, async t => {
  const { page, state } = await setup(t);
  await activate(page);
  state.scheduled = [{ ...order('missed-release'), scheduledTime: new Date(Date.now() + 20 * 60_000 + 800).toISOString() }];
  await wake(page);
  await page.getByRole('button', { name: /Förbeställningar/ }).click();
  await page.locator('.preorder-card').waitFor();
  state.pendingStatus = 500;
  await page.waitForTimeout(1200);
  await silent(page);
  state.pendingStatus = 200;
  await wake(page);
  await overlay(page);
  await sound(page);
});

test('customer sees a same-day booking until the release boundary then live pickup tracking', { timeout: 25000 }, async t => {
  const { page, state } = await setup(t);
  const pickup = new Date(Date.now() + 20 * 60_000 + 2000).toISOString();
  state.scheduled = [{ ...order('customer-booking'), scheduledTime: pickup, estimatedReadyTime: pickup }];
  await page.goto(ORIGIN + '/status?orderId=customer-booking');
  await page.getByText('Din beställning är bokad', { exact: true }).waitFor();
  await page.getByText('Väntar på bekräftelse', { exact: true }).waitFor();
});

test('phone pickup shows date and time directly, preserves chosen times and keeps the default current', { timeout: 30000 }, async t => {
  const product = { id: '11111111-1111-4111-8111-111111111111', name: 'Kunafa', price: 5000,
    category: 'Kunafa', inStock: true, hidden: false, stockByLocation: { [MOLLE]: true }, variantPrices: { '250 gram': 5000 } };
  const { page, state } = await setup(t, { profile: 'owner', products: [product], nowMs: Date.parse('2026-10-15T16:00:00+02:00') });
  page.setDefaultTimeout(6000);
  await page.clock.setFixedTime(new Date('2026-10-15T16:00:00+02:00'));
  await page.getByRole('button', { name: 'Telefonbeställning', exact: true }).click();
  await page.getByLabel('Lokal för upphämtning').selectOption(MOLLE);
  assert.equal(await page.getByLabel('Datum för hämtning').inputValue(), '2026-10-15');
  assert.equal(await page.getByLabel('Tid för hämtning').inputValue(), '16:30');
  assert.equal(await page.locator('#phone-pickup-mode').count(), 0);
  assert.equal(await page.getByText(/Tiderna anges i svensk tid/).count(), 0);
  for (const date of ['2026-10-15', '2026-10-16']) {
    await page.getByRole('button', { name: 'Lägg till Kunafa', exact: true }).click();
    await page.getByLabel('Datum för hämtning').fill(date);
    await page.getByLabel('Tid för hämtning').fill('18:00');
    // Leaving and returning must preserve an explicit selection.
    await page.getByRole('button', { name: /Förbeställningar/ }).click();
    await page.getByRole('button', { name: 'Telefonbeställning', exact: true }).click();
    assert.equal(await page.getByLabel('Datum för hämtning').inputValue(), date);
    assert.equal(await page.getByLabel('Tid för hämtning').inputValue(), '18:00');
    await page.getByRole('button', { name: 'Skicka beställning till Möllevången', exact: true }).click();
    await page.locator('.phone-orders__success').waitFor();
    assert.equal(state.phoneRequests.at(-1).scheduledTime, date + 'T18:00:00');
    assert.equal(await page.getByLabel('Datum för hämtning').inputValue(), '2026-10-15');
    assert.equal(await page.getByLabel('Tid för hämtning').inputValue(), '16:30');
    assert.ok((await page.locator('.phone-orders__success').textContent()).includes(date));
    await page.getByRole('button', { name: /Förbeställningar/ }).click();
    await page.locator('.preorder-card').filter({ hasText: state.phoneRequests.at(-1).requestId }).waitFor();
    await silent(page); // Owner monitors phone pre-orders; only the location may accept them.
    await page.getByRole('button', { name: 'Telefonbeställning', exact: true }).click();
  }
  await page.clock.setFixedTime(new Date('2026-10-15T16:20:00+02:00'));
  state.nowMs = Date.parse('2026-10-15T16:20:00+02:00');
  await page.getByRole('button', { name: /Förbeställningar/ }).click();
  await page.getByRole('button', { name: 'Telefonbeställning', exact: true }).click();
  assert.equal(await page.getByLabel('Tid för hämtning').inputValue(), '16:50');
  await page.getByRole('button', { name: 'Lägg till Kunafa', exact: true }).click();
  await page.getByRole('button', { name: 'Skicka beställning till Möllevången', exact: true }).click();
  await page.locator('.phone-orders__success').waitFor();
  assert.equal(state.phoneRequests.length, 3);
  assert.equal(state.phoneRequests.at(-1).scheduledTime, '2026-10-15T16:50:00');
  assert.equal(new Set(state.phoneRequests.map(request => request.requestId)).size, 3);
});
