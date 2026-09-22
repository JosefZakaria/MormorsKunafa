import test from 'node:test';
import assert from 'node:assert/strict';
import webpush from 'web-push';

process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-test-key';
const vapid = webpush.generateVAPIDKeys();
process.env.WEB_PUSH_VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.WEB_PUSH_VAPID_PRIVATE_KEY = vapid.privateKey;

const locationId = '2f1a9c4e-6b7d-4e8f-a901-b2c3d4e5f601';
const eventId = '00000000-0000-4000-8000-000000000041';
let order;
let jobs;
let subscriptions;
let logs;
let sent;
let provider;
let adminExists;

function reset() {
  order = {
    id: 'order-41', order_number: '#1041', order_type: 'takeaway', location_id: locationId,
    payment_status: 'paid', push_event_id: eventId,
  };
  jobs = new Map();
  subscriptions = [
    { id: 'sub-a', admin_id: 'hoja-admin', endpoint: 'https://push.example/a', p256dh: 'a', auth: 'a', disabled_at: null },
    { id: 'sub-b', admin_id: 'hoja-admin', endpoint: 'https://push.example/b', p256dh: 'b', auth: 'b', disabled_at: null },
  ];
  logs = new Map();
  sent = [];
  provider = async () => ({ statusCode: 201 });
  adminExists = true;
}

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = init.method || (input instanceof Request ? input.method : 'GET');
  const table = url.pathname.split('/').at(-1);
  const eq = name => url.searchParams.get(name)?.replace(/^eq\./, '');

  if (table === 'reconcile_admin_push_outbox' && method === 'POST') {
    if (order.payment_status !== 'paid' || !order.push_event_id || jobs.has(order.push_event_id)) return json(0);
    const now = new Date().toISOString();
    jobs.set(order.push_event_id, {
      event_id: order.push_event_id, order_id: order.id, status: 'pending', attempts: 0,
      created_at: now, updated_at: now, next_attempt_at: now, lease_token: null, lease_until: null, last_error: null,
    });
    return json(1);
  }
  if (table === 'claim_admin_push_outbox' && method === 'POST') {
    const due = [...jobs.values()].filter(job =>
      (job.status === 'pending' && Date.parse(job.next_attempt_at) <= Date.now()) ||
      (job.status === 'leased' && Date.parse(job.lease_until) < Date.now())
    ).slice(0, 10);
    for (const job of due) {
      job.status = 'leased';
      job.attempts += 1;
      job.lease_token = crypto.randomUUID();
      job.lease_until = new Date(Date.now() + 120000).toISOString();
    }
    return json(due.map(job => ({ ...job })));
  }
  if (table === 'orders' && method === 'GET') return json(eq('id') === order.id ? order : null);
  if (table === 'admin_push_subscriptions' && method === 'GET') {
    return json(subscriptions.filter(sub => sub.disabled_at === null));
  }
  if (table === 'admin_users' && method === 'GET') {
    return json(adminExists ? { id: 'hoja-admin', role: 'location', location_id: locationId } : null);
  }
  if (table === 'locations' && method === 'GET') {
    return json({ id: locationId, slug: 'hoja', fulfills_delivery: true });
  }
  if (table === 'admin_push_delivery_logs' && method === 'GET') {
    return json(logs.get(`${eq('event_id')}:${eq('subscription_id')}`) ?? null);
  }
  if (table === 'admin_push_delivery_logs' && method === 'POST') {
    const row = JSON.parse(init.body);
    logs.set(`${row.event_id}:${row.subscription_id}`, row);
    return json(row, 201);
  }
  if (table === 'admin_push_subscriptions' && method === 'PATCH') {
    const matched = subscriptions.filter(item =>
      (eq('id') && item.id === eq('id')) || (eq('endpoint') && item.endpoint === eq('endpoint'))
    );
    for (const sub of matched) Object.assign(sub, JSON.parse(init.body));
    return new Response(null, { status: 204 });
  }
  if (table === 'admin_push_outbox' && method === 'PATCH') {
    const job = jobs.get(eq('event_id'));
    if (!job || job.lease_token !== eq('lease_token') || job.status !== 'leased') return json([]);
    Object.assign(job, JSON.parse(init.body));
    return json([{ event_id: job.event_id }]);
  }
  throw new Error(`Unexpected mock database request: ${method} ${url}`);
};

const { configureWebPush } = await import('../backend/src/services/pushNotifications.ts');
const { drainPushOutbox } = await import('../backend/src/services/pushOutboxWorker.ts');
const { settlePushOutboxJob } = await import('../backend/src/db/pushOutboxRepository.ts');
const { handlePushDrain } = await import('../backend/src/routes/internalPush.ts');
configureWebPush();
const originalSend = webpush.sendNotification;
webpush.sendNotification = async (recipient, payload, options) => {
  sent.push({ endpoint: recipient.endpoint, payload: JSON.parse(payload), options });
  return provider(recipient);
};

test.after(() => { webpush.sendNotification = originalSend; });

test('payment marker is reconciled after interruption and parallel workers claim it once', async () => {
  reset();
  const results = await Promise.all([drainPushOutbox(), drainPushOutbox()]);
  assert.equal(results.reduce((sum, result) => sum + result.reconciled, 0), 1);
  assert.equal(results.reduce((sum, result) => sum + result.claimed, 0), 1);
  assert.equal(jobs.get(eventId).status, 'done');
  assert.deepEqual(sent.map(call => call.endpoint).sort(), ['https://push.example/a', 'https://push.example/b']);
  assert.ok(sent.every(call => call.payload.event_id === eventId && call.options.timeout === 3000));
  assert.deepEqual([...logs.values()].map(log => log.status), ['success', 'success']);
});

test('retry sends only to the device that missed the earlier attempt', async () => {
  reset();
  provider = async recipient => {
    if (recipient.endpoint.endsWith('/b')) throw Object.assign(new Error('temporary outage'), { statusCode: 503 });
    return { statusCode: 201 };
  };
  assert.equal((await drainPushOutbox()).pending, 1);
  assert.equal(jobs.get(eventId).status, 'pending');
  assert.equal(logs.get(`${eventId}:sub-a`).status, 'success');
  assert.equal(logs.get(`${eventId}:sub-b`).status, 'failed');
  jobs.get(eventId).next_attempt_at = new Date(Date.now() - 1000).toISOString();
  provider = async () => ({ statusCode: 201 });
  assert.equal((await drainPushOutbox()).done, 1);
  assert.equal(jobs.get(eventId).status, 'done');
  assert.deepEqual(sent.map(call => call.endpoint).sort(), [
    'https://push.example/a', 'https://push.example/b', 'https://push.example/b',
  ]);
  assert.equal(logs.get(`${eventId}:sub-b`).status, 'success');
});

test('no device is retried and then becomes a visible dead job after 15 minutes', async () => {
  reset();
  subscriptions = [];
  assert.equal((await drainPushOutbox()).pending, 1);
  const job = jobs.get(eventId);
  assert.match(job.last_error, /No active subscription/);
  job.created_at = new Date(Date.now() - 16 * 60000).toISOString();
  job.next_attempt_at = new Date(Date.now() - 1000).toISOString();
  assert.equal((await drainPushOutbox()).dead, 1);
  assert.equal(job.status, 'dead');
  assert.equal(sent.length, 0);
});

test('orphaned subscriptions are disabled before any order payload is sent', async () => {
  reset();
  adminExists = false;
  assert.equal((await drainPushOutbox()).pending, 1);
  assert.equal(sent.length, 0);
  assert.ok(subscriptions.every(sub => sub.disabled_at !== null));
});

test('expired provider subscriptions are disabled while the event remains pending', async () => {
  reset();
  provider = async () => { throw Object.assign(new Error('gone'), { statusCode: 410 }); };
  assert.equal((await drainPushOutbox()).pending, 1);
  assert.equal(jobs.get(eventId).status, 'pending');
  assert.ok(subscriptions.every(sub => sub.disabled_at !== null));
  assert.equal(sent.length, 2);
  jobs.get(eventId).next_attempt_at = new Date(Date.now() - 1000).toISOString();
  assert.equal((await drainPushOutbox()).pending, 1);
  assert.equal(sent.length, 2);
});

test('expired lease is reclaimed, and an old lease token cannot settle the job', async () => {
  reset();
  await drainPushOutbox();
  const job = jobs.get(eventId);
  job.status = 'leased';
  job.lease_token = crypto.randomUUID();
  job.lease_until = new Date(Date.now() - 1000).toISOString();
  const oldToken = job.lease_token;
  assert.equal((await drainPushOutbox()).claimed, 1);
  assert.equal(job.status, 'done');
  assert.equal(job.attempts, 2);
  assert.notEqual(job.lease_token, oldToken);
  assert.equal(await settlePushOutboxJob({ ...job, lease_token: oldToken }, 'pending', 'stale result'), false);
  assert.equal(job.status, 'done');
  assert.equal(sent.length, 2);
});

test('scheduled worker requires its bearer secret', async () => {
  reset();
  process.env.PUSH_WORKER_SECRET = 'a'.repeat(32);
  const response = () => ({
    statusCode: 200,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  });
  const denied = response();
  await handlePushDrain({ headers: { authorization: 'Bearer wrong' } }, denied);
  assert.equal(denied.statusCode, 401);
  assert.equal(jobs.size, 0);
  const accepted = response();
  await handlePushDrain({ headers: { authorization: `Bearer ${process.env.PUSH_WORKER_SECRET}` } }, accepted);
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.body.done, 1);
  delete process.env.PUSH_WORKER_SECRET;
});
