import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-test-key';
delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;

const hojaId = '2f1a9c4e-6b7d-4e8f-a901-b2c3d4e5f601';
const molleId = '2f1a9c4e-6b7d-4e8f-a901-b2c3d4e5f602';
const subscriptions = [
  { id: 'hoja-sub', admin_id: 'hoja-admin', endpoint: 'https://push.example/hoja' },
  { id: 'molle-sub', admin_id: 'molle-admin', endpoint: 'https://push.example/molle' },
];
const failures = [];
const logs = [];

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = init.method || (input instanceof Request ? input.method : 'GET');
  const table = url.pathname.split('/').at(-1);
  const eq = name => url.searchParams.get(name)?.replace(/^eq\./, '');
  let body;
  if (table === 'admin_push_subscriptions' && method === 'GET') body = subscriptions;
  else if (table === 'admin_users' && method === 'GET') {
    const isHoja = eq('id') === 'hoja-admin';
    body = { id: eq('id'), role: 'location', location_id: isHoja ? hojaId : molleId };
  } else if (table === 'locations' && method === 'GET') {
    body = { id: eq('id'), slug: eq('id') === hojaId ? 'hoja' : 'mollevangen', fulfills_delivery: eq('id') === hojaId };
  } else if (table === 'admin_push_subscriptions' && method === 'PATCH') {
    failures.push({ id: eq('id'), ...JSON.parse(init.body) });
    return new Response(null, { status: 204 });
  } else if (table === 'admin_push_delivery_logs' && method === 'POST') {
    logs.push(JSON.parse(init.body));
    return new Response(null, { status: 201 });
  } else throw new Error(`Unexpected mock database request: ${method} ${url}`);
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
};

const { sendOrderCreatedPush, sendTestPush } = await import('../backend/src/services/pushNotifications.ts');

test('missing push configuration marks only the order location as failed', async () => {
  await sendOrderCreatedPush({
    event_id: '00000000-0000-4000-8000-000000000001',
    event_type: 'ORDER_CREATED',
    order_id: 'order-1',
    order_number: '#1001',
    created_at: new Date().toISOString(),
    order_type: 'takeaway',
    location_id: hojaId,
  });
  assert.deepEqual(failures.map(failure => failure.id), ['hoja-sub']);
  assert.match(failures[0].last_failure_reason, /Web Push is not configured/);
  assert.deepEqual(logs.map(log => [log.subscription_id, log.status]), [['hoja-sub', 'failed']]);
});

test('test notification also records missing server configuration for that tablet', async () => {
  failures.length = 0;
  logs.length = 0;
  assert.equal(await sendTestPush(subscriptions[0]), false);
  assert.deepEqual(failures.map(failure => failure.id), ['hoja-sub']);
  assert.deepEqual(logs.map(log => [log.subscription_id, log.status]), [['hoja-sub', 'failed']]);
});
