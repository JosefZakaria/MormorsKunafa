import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { gzipSync } from 'node:zlib';
import { test } from 'node:test';

test('HTTP hardening preserves authentication, CORS, JSON parsing and signed Stripe webhooks', async t => {
  Object.assign(process.env, {
    NODE_ENV: 'production', SUPABASE_URL: 'http://127.0.0.1:9',
    SUPABASE_SERVICE_ROLE_KEY: 'isolated-http-test', JWT_SECRET: 'isolated-http-test-secret-at-least-32-characters',
    PUBLIC_WEB_APP_URL: 'https://mormorskunafa.se', STRIPE_SECRET_KEY: 'sk_test_isolated_http',
    STRIPE_WEBHOOK_SECRET: 'whsec_isolated_http',
  });
  const { default: app } = await import('../dist/index.js');
  const { getStripe } = await import('../dist/services/stripeClient.js');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const request = (path, options) => fetch(`http://127.0.0.1:${server.address().port}${path}`, options);
  const headers = {
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
  };

  await t.test('API successes, authentication failures and errors carry the security headers', async () => {
    for (const [path, status, options] of [
      ['/api/health', 200], ['/api/admin/session', 401], ['/api/not-a-route', 404],
      ['/api/admin/login', 400, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }],
    ]) {
      const response = await request(path, options);
      assert.equal(response.status, status);
      for (const [name, value] of Object.entries(headers)) {
        // Express gives its built-in HTML error pages a stricter default CSP.
        const expected = name === 'Content-Security-Policy' && [400, 404].includes(status) ? "default-src 'none'" : value;
        assert.equal(response.headers.get(name), expected, name);
      }
      assert.equal(response.headers.get('X-Powered-By'), null);
    }
    const frontend = JSON.parse(readFileSync(new URL('../../apps/web/vercel.json', import.meta.url), 'utf8'));
    const rule = frontend.headers?.find(rule => rule.source === '/(.*)');
    assert.ok(rule, 'Frontend documents and assets need the same headers');
    assert.deepEqual(Object.fromEntries(rule.headers.map(({ key, value }) => [key, value])), headers);
  });

  await t.test('approved CORS preflights still support cookie login and CSRF headers', async () => {
    const preflight = origin => request('/api/admin/login', { method: 'OPTIONS', headers: {
      Origin: origin, 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,x-admin-request,x-csrf-token',
    } });
    const allowed = await preflight('https://mormorskunafa.se');
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://mormorskunafa.se');
    assert.equal(allowed.headers.get('Access-Control-Allow-Credentials'), 'true');
    assert.equal((await preflight('https://untrusted.example.invalid')).headers.get('Access-Control-Allow-Origin'), null);
  });

  await t.test('compressed bodies and invalid trailing bytes do not take down the server', async () => {
    const compressed = gzipSync(Buffer.from('{"email":"test@example.invalid","password":"synthetic"}'));
    for (const body of [compressed, Buffer.concat([compressed, Buffer.from('invalid trailing bytes')])]) {
      const response = await request('/api/admin/login', { method: 'POST', body,
        headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' } });
      assert.ok([400, 403].includes(response.status));
      assert.equal((await request('/api/health')).status, 200);
    }
  });

  await t.test('Stripe receives the exact signed raw body before JSON parsing', async () => {
    // An ignored event type exercises signature verification without creating or paying an order.
    const payload = '{\n  "id": "evt_isolated_http", "type": "security.regression_test", "data": { "object": {} }\n}';
    const signature = getStripe().webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
    const response = await request('/api/stripe/webhook', { method: 'POST', body: payload,
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { received: true });
  });
});
