import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-test-key';
delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;

let paid = false;
let pushLookups = 0;
let paymentUpdates = 0;
let activeSubscriptions = [];
let committedPushEventId = null;
const pushFailures = [];
const deliveryLogs = [];
const order = {
  id: 'order-1', order_number: '#1001', order_type: 'takeaway',
  location_id: '2f1a9c4e-6b7d-4e8f-a901-b2c3d4e5f601', total_ore: 12000,
  customer_email: null, customer_phone: null,
};

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = init.method || (input instanceof Request ? input.method : 'GET');
  const table = url.pathname.split('/').at(-1);
  let body;
  if (table === 'orders' && method === 'GET') body = { ...order, payment_status: paid ? 'paid' : 'pending' };
  else if (table === 'orders' && method === 'PATCH') {
    paymentUpdates += 1;
    const patch = JSON.parse(init.body);
    assert.equal(patch.payment_status, 'paid');
    assert.match(patch.push_event_id, /^[0-9a-f-]{36}$/i);
    assert.equal(patch.push_event_created_at, patch.updated_at);
    body = paid ? [] : [{ id: order.id }];
    if (!paid) committedPushEventId = patch.push_event_id;
    paid = true;
  } else if (table === 'order_items' && method === 'GET') body = [];
  else if (table === 'admin_push_subscriptions' && method === 'GET') {
    pushLookups += 1;
    body = activeSubscriptions;
  } else if (table === 'admin_users' && method === 'GET') {
    body = { id: 'admin-1', role: 'location', location_id: order.location_id };
  } else if (table === 'locations' && method === 'GET') {
    body = { id: order.location_id, slug: 'hoja', fulfills_delivery: true };
  } else if (table === 'admin_push_subscriptions' && method === 'PATCH') {
    pushFailures.push(JSON.parse(init.body));
    return new Response(null, { status: 204 });
  } else if (table === 'admin_push_delivery_logs' && method === 'POST') {
    deliveryLogs.push(JSON.parse(init.body));
    return new Response(null, { status: 201 });
  } else {
    throw new Error(`Unexpected mock database request: ${method} ${url}`);
  }
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
};

const { markOrderPaid } = await import('../backend/src/services/markOrderPaid.ts');
const { registerRealtimeClient } = await import('../backend/src/services/realtimeEvents.ts');

test('repeated payment confirmations through the shared transition create one order alert', async () => {
  const written = [];
  const cleanup = registerRealtimeClient({
    adminId: 'admin-1', role: 'location', locationId: order.location_id, fulfillsDelivery: true,
  }, { write: chunk => written.push(chunk) });
  try {
    assert.equal(await markOrderPaid(order.id, { paidAmountOre: 12000 }), true);
    assert.equal(await markOrderPaid(order.id, { paidAmountOre: 12000 }), false);
    assert.equal(await markOrderPaid(order.id, { paidAmountOre: 12000 }), false);
    assert.equal(paymentUpdates, 3);
    assert.match(committedPushEventId, /^[0-9a-f-]{36}$/i);
    assert.equal(pushLookups, 0);
    assert.equal(written.filter(chunk => chunk === 'event: ORDER_CREATED\n').length, 1);
  } finally {
    cleanup();
  }
});

test('concurrent payment confirmations still create one order alert', async () => {
  paid = false;
  paymentUpdates = 0;
  pushLookups = 0;
  committedPushEventId = null;
  const written = [];
  const cleanup = registerRealtimeClient({
    adminId: 'admin-1', role: 'location', locationId: order.location_id, fulfillsDelivery: true,
  }, { write: chunk => written.push(chunk) });
  try {
    const outcomes = await Promise.all([
      markOrderPaid(order.id, { paidAmountOre: 12000 }),
      markOrderPaid(order.id, { paidAmountOre: 12000 }),
    ]);
    assert.deepEqual(outcomes.sort(), [false, true]);
    assert.equal(paymentUpdates, 2);
    assert.match(committedPushEventId, /^[0-9a-f-]{36}$/i);
    assert.equal(pushLookups, 0);
    assert.equal(written.filter(chunk => chunk === 'event: ORDER_CREATED\n').length, 1);
  } finally {
    cleanup();
  }
});

test('payment commits without waiting for any push provider attempt', async () => {
  paid = false;
  committedPushEventId = null;
  pushLookups = 0;
  activeSubscriptions = [{ id: 'hoja-sub', admin_id: 'admin-1', endpoint: 'https://push.example/hoja' }];
  pushFailures.length = 0;
  deliveryLogs.length = 0;
  try {
    assert.equal(await markOrderPaid(order.id, { paidAmountOre: 12000 }), true);
    assert.equal(paid, true);
    assert.match(committedPushEventId, /^[0-9a-f-]{36}$/i);
    assert.equal(pushLookups, 0);
    assert.equal(pushFailures.length, 0);
    assert.equal(deliveryLogs.length, 0);
    assert.equal(await markOrderPaid(order.id, { paidAmountOre: 12000 }), false);
    assert.equal(deliveryLogs.length, 0);
  } finally {
    activeSubscriptions = [];
  }
});
