import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import webpush from 'web-push';

process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-test-key';
process.env.JWT_SECRET = 'local-test-jwt-secret';
const vapid = webpush.generateVAPIDKeys();
process.env.WEB_PUSH_VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.WEB_PUSH_VAPID_PRIVATE_KEY = vapid.privateKey;

const target = {
  id: 'subscription-1', admin_id: 'hoja-admin', endpoint: 'https://push.example/device-a',
  p256dh: 'device-public-key', auth: 'device-secret', disabled_at: null,
};
const subscriptionUpdates = [];
const deliveryLogs = [];
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = init.method || (input instanceof Request ? input.method : 'GET');
  const table = url.pathname.split('/').at(-1);
  if (table === 'admin_push_subscriptions' && method === 'GET') {
    const match = url.searchParams.get('admin_id') === `eq.${target.admin_id}`
      && url.searchParams.get('endpoint') === `eq.${target.endpoint}`;
    return new Response(JSON.stringify(match ? target : null), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (table === 'admin_push_subscriptions' && method === 'PATCH') {
    subscriptionUpdates.push(JSON.parse(init.body));
    return new Response(null, { status: 204 });
  }
  if (table === 'admin_push_delivery_logs' && method === 'POST') {
    deliveryLogs.push(JSON.parse(init.body));
    return new Response(null, { status: 201 });
  }
  throw new Error(`Unexpected mock database request: ${method} ${url}`);
};

const { configureWebPush } = await import('../backend/src/services/pushNotifications.ts');
const { signToken } = await import('../backend/src/middleware/auth.ts');
const { default: adminRouter } = await import('../backend/src/routes/admin.ts');
configureWebPush();

test('test push requires login and this account’s exact device subscription', async () => {
  const sent = [];
  const originalSend = webpush.sendNotification;
  webpush.sendNotification = async recipient => { sent.push(recipient.endpoint); return { statusCode: 201 }; };
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/api/admin/notifications/test`;
  const token = signToken({ adminId: 'hoja-admin', email: 'hoja@example.test' });
  const otherToken = signToken({ adminId: 'other-admin', email: 'other@example.test' });
  const request = (authToken, subscription) => nativeFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(authToken ? { authorization: `Bearer ${authToken}` } : {}) },
    body: JSON.stringify({ subscription }),
  });
  const subscription = { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } };
  try {
    assert.equal((await request(null, subscription)).status, 401);
    assert.equal((await request(token, { ...subscription, keys: { ...subscription.keys, auth: 'wrong' } })).status, 404);
    assert.equal((await request(otherToken, subscription)).status, 404);
    assert.equal((await request(token, subscription)).status, 200);
    assert.deepEqual(sent, [target.endpoint]);
    webpush.sendNotification = async () => { throw Object.assign(new Error('push unavailable'), { statusCode: 503 }); };
    assert.equal((await request(token, subscription)).status, 502);
    assert.ok(subscriptionUpdates.some(update => String(update.last_failure_reason).includes('push unavailable')));
    assert.ok(deliveryLogs.some(log => log.status === 'failed'));
  } finally {
    webpush.sendNotification = originalSend;
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
