const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/services/publicSettings.ts');
const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup(fetchResponse, pathname = '/') {
  const calls = [];
  const links = [];
  const timers = new Set();
  const exports = {};
  class ApiError extends Error {
    constructor(status, statusText) { super(statusText); this.status = status; }
  }
  vm.runInNewContext(compiled, {
    exports, Error, AbortController,
    require: () => ({ API_CONFIG: { baseUrl: 'https://api.example/api', timeout: 10000 }, ApiError }),
    fetch: (...args) => { calls.push(args); return fetchResponse(...args); },
    window: { location: { pathname } },
    document: { createElement: () => ({}), head: { appendChild: link => links.push(link) } },
    setTimeout: callback => { timers.add(callback); return callback; },
    clearTimeout: callback => timers.delete(callback),
  }, { filename });
  return { ...exports, calls, links, timers };
}

function response(settings) {
  return { ok: true, json: async () => settings };
}

const saved = {
  heroImageDesktop: 'https://images.example/current-desktop.jpg',
  heroImageMobile: 'https://images.example/current-mobile.jpg',
  isPaused: true,
};

test('starts settings before the app and shares the pending request between consumers', async () => {
  const pending = deferred();
  const app = setup(() => pending.promise);
  app.preloadLandingSettings();
  assert.equal(app.calls.length, 1);
  assert.equal(app.links.length, 0);
  const first = app.getPublicSettings();
  assert.equal(first, app.getPublicSettings());
  const [url, options] = app.calls[0];
  assert.equal(url, 'https://api.example/api/orders/settings');
  assert.equal(options.headers, undefined); // No JSON header to trigger OPTIONS.
  assert.equal(options.cache, 'no-store');
  pending.resolve(response(saved));
  assert.equal(await first, saved);
  assert.equal(app.timers.size, 0);
});

test('preloads the current desktop and mobile images with matching media and priority', async () => {
  const app = setup(async () => response(saved));
  app.preloadLandingSettings();
  await app.getPublicSettings();
  assert.deepEqual(app.links.map(link => [link.href, link.media]), [
    [saved.heroImageDesktop, '(min-width: 969px)'],
    [saved.heroImageMobile, '(max-width: 968px)'],
  ]);
  for (const link of app.links) {
    assert.equal(link.rel, 'preload');
    assert.equal(link.as, 'image');
    assert.equal(link.fetchPriority, 'high');
  }
});

test('retains an early completed response for the app but fetches fresh settings later', async () => {
  let settings = saved;
  const app = setup(async () => response(settings));
  app.preloadLandingSettings();
  await new Promise(resolve => setImmediate(resolve));
  const first = app.getPublicSettings();
  assert.equal(first, app.getPublicSettings());
  assert.equal(await first, saved);
  assert.equal(app.calls.length, 1);
  settings = { ...saved, isPaused: false, heroImageDesktop: 'https://images.example/replaced.jpg' };
  assert.equal(await app.getPublicSettings(), settings);
  assert.equal(app.calls.length, 2);
});

test('a late preload entry cannot save an already consumed response for a later visit', async () => {
  const pending = deferred();
  const app = setup(() => pending.promise);
  const first = app.getPublicSettings();
  app.preloadLandingSettings();
  pending.resolve(response(saved));
  await first;
  await app.getPublicSettings();
  assert.equal(app.calls.length, 2);
});

test('skips early requests and hero preloads on other pages', async () => {
  const app = setup(async () => response(saved), '/admin/dashboard');
  app.preloadLandingSettings();
  assert.equal(app.calls.length, 0);
  await app.getPublicSettings();
  assert.equal(app.calls.length, 1);
  assert.equal(app.links.length, 0);
});

test('does not preload default images when saved image URLs are missing', async () => {
  const app = setup(async () => response({ isPaused: false }));
  app.preloadLandingSettings();
  await app.getPublicSettings();
  assert.equal(app.links.length, 0);
});

test('early failures reach the app fallback and later requests can recover', async () => {
  const offline = new Error('offline');
  let fail = true;
  const app = setup(async () => { if (fail) throw offline; return response(saved); });
  app.preloadLandingSettings();
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(app.getPublicSettings(), error => error === offline);
  fail = false;
  assert.equal(await app.getPublicSettings(), saved);
  assert.equal(app.calls.length, 2);
  assert.equal(app.timers.size, 0);
});

test('HTTP errors reject rather than preloading an error response', async () => {
  const app = setup(async () => ({ ok: false, status: 500, statusText: 'Server error' }));
  await assert.rejects(app.getPublicSettings(), error => error.status === 500);
  assert.equal(app.links.length, 0);
  assert.equal(app.timers.size, 0);
});

test('stalled requests still time out and release the active request', async () => {
  const app = setup((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    });
  }));
  const request = app.getPublicSettings();
  for (const callback of app.timers) callback();
  await assert.rejects(request, /Request timeout/);
  assert.equal(app.timers.size, 0);
});
