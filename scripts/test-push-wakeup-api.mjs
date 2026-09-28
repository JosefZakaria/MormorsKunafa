import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';
import webpush from 'web-push';
import { withTestDatabase } from './lib/local-test-database.mjs';
import { initializeSyntheticDatabase, createSyntheticApp, HOJA, MOLLEVANGEN, TEST_PASSWORD, literal } from './lib/synthetic-api.mjs';
import { pushWorkerHarness } from './lib/push-worker-harness.mjs';

const nativeFetch = globalThis.fetch;
const captured = [];
let barrier;
globalThis.__pushWakeupTest = {
  async revalidated(current) { if (current && barrier) { barrier.reached(); await barrier.resume; } return current; },
  send(target, payload) { captured.push({ target, payload: JSON.parse(payload) }); },
};
const repositoryUrl = new URL('../backend/dist/db/pushSubscriptionsRepository.js', import.meta.url).href;
const transportUrl = new URL('../backend/dist/utils/webPushSecurity.js', import.meta.url).href;
const substitutes = new Map([
  ['../db/pushSubscriptionsRepository.js', `
    export * from ${JSON.stringify(repositoryUrl)};
    import { isPushSubscriptionCurrent as actual } from ${JSON.stringify(repositoryUrl)};
    export async function isPushSubscriptionCurrent(row) {
      return globalThis.__pushWakeupTest.revalidated(await actual(row));
    }`],
  ['../utils/webPushSecurity.js', `
    export * from ${JSON.stringify(transportUrl)};
    export async function sendWebPushSafely(target, payload) { globalThis.__pushWakeupTest.send(target, payload); }`],
]);
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith('/backend/dist/services/pushNotifications.js') && substitutes.has(specifier)) {
    return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(substitutes.get(specifier))}` };
  }
  return nextResolve(specifier, context);
} });

await withTestDatabase(async db => {
  await initializeSyntheticDatabase(db);
  const { app } = await createSyntheticApp(db);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function call(route, body, headers = {}) {
    const response = await nativeFetch(origin + route, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    return { status: response.status, headers: response.headers, data: text ? JSON.parse(text) : null };
  }
  async function login(name) {
    const response = await call('/api/admin/login', { email: `${name}@example.test`, password: TEST_PASSWORD });
    assert.equal(response.status, 200);
    const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    return { cookie, 'x-csrf-token': decodeURIComponent(cookie.match(/mk_csrf=([^;]+)/)[1]) };
  }
  const pendingUrl = '/api/admin/notifications/pending';
  async function decision(headers, expected) {
    const response = await call(pendingUrl, undefined, headers);
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.deepEqual(response.data, { shouldNotify: expected });
    assert.match(response.headers.get('cache-control'), /private.*no-store/);
  }
  async function workerDecision(headers, expected) {
    const worker = await pushWorkerHarness((url, options) => nativeFetch(origin + url, { ...options, headers }));
    await worker.push(captured[0]?.payload);
    assert.equal(worker.notifications.length, expected ? 1 : 0);
  }
  try {
    const hoja = await login('hoja'), molle = await login('mollevangen'), owner = await login('owner');
    assert.equal((await call(pendingUrl)).status, 401);
    await decision(hoja, false); await decision(molle, false); await workerDecision(hoja, false);
    const orderId = randomUUID();
    await db.sql(`INSERT INTO orders(id,order_number,location_id,status,payment_status,scheduled_at,customer_phone)
      VALUES (${literal(orderId)},'9911',${literal(HOJA)},'ny','pending',now()+interval '2 days','+46700000101')`);
    await decision(hoja, false);
    await db.sql(`UPDATE orders SET payment_status='paid' WHERE id=${literal(orderId)}`);
    await decision(hoja, true); await decision(molle, false); await decision(owner, true);
    await workerDecision(hoja, true); await workerDecision(molle, false); await workerDecision({}, false);

    // Current database location overrides the still-valid session's old location.
    await db.sql(`UPDATE admin_users SET location_id=${literal(MOLLEVANGEN)} WHERE id='hoja-test'`);
    await decision(hoja, false);
    await db.sql(`UPDATE admin_users SET location_id=${literal(HOJA)} WHERE id='hoja-test'`);
    await decision(hoja, true);

    const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic-wakeup-race',
      keys: { p256dh: Buffer.alloc(65, 1).toString('base64url'), auth: Buffer.alloc(16, 2).toString('base64url') } };
    assert.equal((await call('/api/admin/push-subscriptions', { subscription }, hoja)).status, 201);
    const vapid = webpush.generateVAPIDKeys();
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = vapid.publicKey;
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY = vapid.privateKey;
    const { configureWebPush, sendOrderCreatedPush } = await import('../backend/dist/services/pushNotifications.js');
    configureWebPush();
    const event = { event_id: randomUUID(), event_type: 'ORDER_CREATED', order_id: orderId,
      order_number: '#9911', created_at: '2026-09-16T00:00:00Z', order_type: 'takeaway', location_id: HOJA };
    let reached, release;
    const observed = new Promise(resolve => { reached = resolve; });
    barrier = { reached, resume: new Promise(resolve => { release = resolve; }) };
    const sending = sendOrderCreatedPush(event);
    let barrierTimer;
    try {
      await Promise.race([observed, new Promise((_, reject) => {
        barrierTimer = setTimeout(() => reject(new Error('Sender did not reach revalidation barrier')), 20_000);
      })]);
      assert.equal(captured.length, 0, 'Sender must be paused after actual database revalidation');
      // A real registration transaction must commit while sender is paused: no lock over send.
      assert.equal((await call('/api/admin/push-subscriptions', { subscription }, molle)).status, 201);
      assert.equal(await db.sql(`SELECT admin_id FROM admin_push_subscriptions
        WHERE endpoint=${literal(subscription.endpoint)} AND disabled_at IS NULL`), 'mollevangen-test');
    } finally { clearTimeout(barrierTimer); barrier = undefined; release(); }
    await sending;
    assert.equal(captured.length, 1);
    assert.equal(captured[0].target.endpoint, subscription.endpoint);
    assert.deepEqual(captured[0].payload, { type: 'order_wakeup', title: 'Ny order',
      body: 'Det finns beställningar att ta emot', url: '/admin/dashboard' });
    for (const value of [event.event_id, event.order_id, event.order_number, event.created_at, HOJA]) {
      assert(!JSON.stringify(captured[0].payload).includes(value), 'No order-specific metadata at transport boundary');
    }
    await workerDecision(molle, false);
    assert.equal(await db.sql(`SELECT count(*) FROM admin_push_subscriptions
      WHERE endpoint=${literal(subscription.endpoint)} AND disabled_at IS NULL`), '1');

    // Molle's own queue legitimately authorizes an old generic wakeup, never Hoja data.
    await db.sql(`UPDATE orders SET location_id=${literal(MOLLEVANGEN)} WHERE id=${literal(orderId)}`);
    await decision(hoja, false); await decision(molle, true); await workerDecision(molle, true);
    await db.sql(`UPDATE orders SET status='mottagen' WHERE id=${literal(orderId)}`);
    await decision(molle, false); await workerDecision(molle, false);

    // Delivery is scoped by current fulfilment responsibility, not the order's location.
    await db.sql(`UPDATE locations SET fulfills_delivery=false;
      UPDATE locations SET fulfills_delivery=true WHERE id=${literal(HOJA)};
      UPDATE orders SET status='ny',order_type='delivery',location_id=${literal(MOLLEVANGEN)} WHERE id=${literal(orderId)}`);
    await decision(hoja, true); await decision(molle, false);
    await db.sql(`UPDATE locations SET fulfills_delivery=false;
      UPDATE locations SET fulfills_delivery=true WHERE id=${literal(MOLLEVANGEN)}`);
    await decision(hoja, false); await decision(molle, true);
    await db.sql(`UPDATE admin_users SET is_active=false WHERE id='mollevangen-test'`);
    assert.equal((await call(pendingUrl, undefined, molle)).status, 401);
    await workerDecision(molle, false);
    await db.sql(`UPDATE admin_users SET is_active=true WHERE id='mollevangen-test'`);
    assert.equal((await call('/api/admin/logout', { pushEndpoint: subscription.endpoint }, molle)).status, 204);
    assert.equal((await call(pendingUrl, undefined, molle)).status, 401);
    await workerDecision(molle, false);
    assert.equal(await db.sql(`SELECT status FROM orders WHERE id=${literal(orderId)}`), 'ny', 'Push/logout never acknowledges the durable queue');
    console.log('PASS: real post-revalidation transfer barrier; exact generic payload; worker/API current-account, both locations, delivery, pre-order, empty, unpaid, accepted, inactive and logout cases.');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
hooks.deregister();
delete globalThis.__pushWakeupTest;
