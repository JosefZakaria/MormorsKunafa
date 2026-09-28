import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withTestDatabase } from './lib/local-test-database.mjs';
import {
  createSyntheticApp,
  HOJA,
  initializeSyntheticDatabase,
  literal,
  MOLLEVANGEN,
  PRODUCT,
  TEST_PASSWORD,
} from './lib/synthetic-api.mjs';

const nativeFetch = globalThis.fetch;
const safeAlertKeys = [
  'attemptCount', 'channel', 'errorCode', 'event', 'id',
  'maxAttempts', 'orderNumber', 'status', 'updatedAt',
];

await withTestDatabase(async (db) => {
  await initializeSyntheticDatabase(db);
  const { app } = await createSyntheticApp(db);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  async function call(route, body, headers = {}, method = body === undefined ? 'GET' : 'POST') {
    const response = await nativeFetch(origin + route, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return {
      status: response.status,
      headers: response.headers,
      data: text ? JSON.parse(text) : null,
    };
  }

  async function login(email) {
    const response = await call('/api/admin/login', { email, password: TEST_PASSWORD });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    const cookies = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    const csrf = cookies.match(/mk_csrf=([^;]+)/)?.[1];
    assert(csrf, 'Admin login must set a CSRF cookie');
    return { cookie: cookies, 'x-csrf-token': decodeURIComponent(csrf) };
  }

  async function createOrder(locationId, customerSuffix) {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) + 'T14:00';
    const response = await call('/api/orders', {
      items: [{ productId: PRODUCT, variantId: '250 gram', quantity: 1, price: 1, name: 'FORGED' }],
      orderType: 'takeaway',
      locationId,
      paymentMethod: 'card',
      scheduledTime: tomorrow,
      customerInfo: {
        name: 'Synthetic Test',
        phone: `+46700000${customerSuffix}`,
        email: `buyer-${customerSuffix}@example.test`,
      },
    }, {
      'X-Checkout-Contract': 'order-v2',
      'Idempotency-Key': randomUUID(),
    });
    assert.equal(response.status, 201, JSON.stringify(response.data));
    return response.data;
  }

  try {
    const hojaOrder = await createOrder(HOJA, '101');
    const mollevangenOrder = await createOrder(MOLLEVANGEN, '102');

    await db.sql(`INSERT INTO outbound_message_jobs
      (id, order_id, event_key, channel, event_at, message_data, status,
       attempt_count, max_attempts, last_error_code, provider_message_id, completed_at, updated_at)
      VALUES
      (${literal(randomUUID())}::uuid, ${literal(hojaOrder.id)}::uuid, 'order_confirmation', 'email', now(),
       '{"email":"buyer@example.test","raw":"private-provider-body"}'::jsonb,
       'retryable', 1, 5, 'provider_unavailable', 'private-provider-id', NULL, now() - interval '3 minutes'),
      (${literal(randomUUID())}::uuid, ${literal(hojaOrder.id)}::uuid, 'order_confirmation', 'sms', now(),
       '{}'::jsonb, 'uncertain', 2, 5, 'provider_response_uncertain', NULL, NULL, now() - interval '2 minutes'),
      (${literal(randomUUID())}::uuid, ${literal(hojaOrder.id)}::uuid, 'order_accepted', 'sms', now(),
       '{}'::jsonb, 'permanent_failed', 5, 5, 'invalid_recipient', NULL, now(), now() - interval '1 minute'),
      (${literal(randomUUID())}::uuid, ${literal(mollevangenOrder.id)}::uuid, 'order_confirmation', 'email', now(),
       '{}'::jsonb, 'retryable', 1, 5, 'provider_unavailable', NULL, NULL, now() - interval '4 minutes'),
      (${literal(randomUUID())}::uuid, ${literal(mollevangenOrder.id)}::uuid, 'order_confirmation', 'sms', now(),
       '{}'::jsonb, 'pending', 0, 5, NULL, NULL, NULL, now()),
      (${literal(randomUUID())}::uuid, ${literal(mollevangenOrder.id)}::uuid, 'order_accepted', 'sms', now(),
       '{}'::jsonb, 'succeeded', 1, 5, NULL, 'provider-success-id', now(), now())`);

    const unauthenticated = await call('/api/admin/notifications');
    assert.equal(unauthenticated.status, 401);

    const ownerHeaders = await login('owner@example.test');
    const hojaHeaders = await login('hoja@example.test');
    const mollevangenHeaders = await login('mollevangen@example.test');

    const ownerAlerts = await call('/api/admin/notifications', undefined, ownerHeaders);
    assert.equal(ownerAlerts.status, 200, JSON.stringify(ownerAlerts.data));
    assert.match(ownerAlerts.headers.get('cache-control'), /private.*no-store/);
    assert.equal(ownerAlerts.data.length, 4);
    assert.deepEqual(new Set(ownerAlerts.data.map((alert) => alert.status)), new Set([
      'retryable', 'uncertain', 'permanent_failed',
    ]));
    for (const alert of ownerAlerts.data) assert.deepEqual(Object.keys(alert).sort(), safeAlertKeys);
    const serializedOwnerAlerts = JSON.stringify(ownerAlerts.data);
    for (const forbidden of [
      'buyer@example.test', 'private-provider-body', 'private-provider-id',
      'message_data', 'provider_message_id', 'orderId', 'locationId',
    ]) {
      assert(!serializedOwnerAlerts.includes(forbidden), `Notification API exposed ${forbidden}`);
    }

    const hojaAlerts = await call('/api/admin/notifications', undefined, hojaHeaders);
    assert.equal(hojaAlerts.status, 200, JSON.stringify(hojaAlerts.data));
    assert.equal(hojaAlerts.data.length, 3);
    assert(hojaAlerts.data.every((alert) => alert.orderNumber === hojaOrder.orderNumber));

    const mollevangenAlerts = await call('/api/admin/notifications', undefined, mollevangenHeaders);
    assert.equal(mollevangenAlerts.status, 200, JSON.stringify(mollevangenAlerts.data));
    assert.equal(mollevangenAlerts.data.length, 1);
    assert.equal(mollevangenAlerts.data[0].orderNumber, mollevangenOrder.orderNumber);
    assert.equal(mollevangenAlerts.data[0].status, 'retryable');

    const limited = await call('/api/admin/notifications?limit=2', undefined, ownerHeaders);
    assert.equal(limited.status, 200, JSON.stringify(limited.data));
    assert.equal(limited.data.length, 2);
    for (const invalidLimit of ['0', '101', '1.5', 'all']) {
      const invalid = await call(`/api/admin/notifications?limit=${invalidLimit}`, undefined, ownerHeaders);
      assert.equal(invalid.status, 400, JSON.stringify(invalid.data));
      assert.match(invalid.headers.get('cache-control'), /private.*no-store/);
    }

    const targetId = hojaAlerts.data[0].id;
    const rejectedDismissal = await call(
      `/api/admin/notifications/${targetId}/read`,
      {},
      hojaHeaders,
      'PATCH'
    );
    assert.equal(rejectedDismissal.status, 409, JSON.stringify(rejectedDismissal.data));
    assert.equal(rejectedDismissal.data.code, 'OUTBOUND_MESSAGE_FAILURE_CANNOT_BE_DISMISSED');
    assert.match(rejectedDismissal.headers.get('cache-control'), /private.*no-store/);
    const afterDismissalAttempt = await call('/api/admin/notifications', undefined, hojaHeaders);
    assert(afterDismissalAttempt.data.some((alert) => alert.id === targetId));

    console.log('Notification failure visibility integration checks passed.');
  } finally {
    globalThis.fetch = nativeFetch;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
