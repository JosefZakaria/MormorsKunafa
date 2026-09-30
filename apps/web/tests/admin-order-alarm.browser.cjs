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
  browser = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required'] });
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
  const state = { pending: [], active: [], pendingStatus: 200, secondaryStatus: 200, holdSecondary: false, releaseSecondary: null, pendingCalls: 0, holdPending: false, releasePending: null, ...options };
  t.after(async () => {
    state.releaseSecondary?.();
    state.releasePending?.();
    await context.close();
    assert.deepEqual(pageErrors, [], 'Unhandled browser errors');
  });
  await page.addInitScript(({ profile, MOLLE }) => {
    localStorage.setItem('authToken', 'isolated-test-token');
    if (profile === 'missing') localStorage.removeItem('adminInfo');
    else if (profile === 'malformed') localStorage.setItem('adminInfo', '{broken-json');
    else localStorage.setItem('adminInfo', JSON.stringify({ id: 'fixture-admin', email: 'fixture@example.invalid', name: 'Fixture', role: 'location', locationId: MOLLE }));
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
        const record = { started: false, stopped: false };
        window.__alarmProbe.sources.push(record);
        const start = source.start.bind(source);
        const stop = source.stop.bind(source);
        source.start = (...args) => { start(...args); record.started = true; };
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
  }, { profile: options.profile || 'valid', MOLLE });

  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === ORIGIN && !url.pathname.startsWith('/api/')) return route.continue();
    const endpoint = url.pathname.replace(/^\/api/, '');
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (endpoint === '/orders/admin/pending') {
      state.pendingCalls += 1;
      const snapshot = [...state.pending];
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
      return json(endpoint.endsWith('/active') ? state.active : [], state.secondaryStatus);
    }
    if (endpoint === '/admin/settings' || endpoint === '/orders/settings') return json(settings);
    if (endpoint === '/locations') return json([location]);
    if (endpoint === '/products') return json([]);
    if (endpoint.endsWith('/accept') && route.request().method() === 'PATCH') {
      const accepted = state.pending.shift();
      if (!accepted) return json({ error: 'missing fixture' }, 404);
      state.active.push({ ...accepted, status: 'mottagen' });
      return json(state.active.at(-1));
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
  await page.getByRole('button', { name: 'Testa (5 s)', exact: true }).waitFor({ timeout: 8000 });
  await silent(page);
}
async function wake(page) {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}
async function overlay(page) {
  await page.locator('.alarm-overlay').waitFor({ timeout: 8000 });
}

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
  await page.waitForTimeout(5500);
  await sound(page);
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
