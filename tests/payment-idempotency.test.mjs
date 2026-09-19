import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-test-key';

let paid = false;
let pushLookups = 0;
let paymentUpdates = 0;
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
    body = paid ? [] : [{ id: order.id }];
    paid = true;
  } else if (table === 'order_items' && method === 'GET') body = [];
  else if (table === 'admin_push_subscriptions' && method === 'GET') {
    pushLookups += 1;
    body = [];
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
    assert.equal(pushLookups, 1);
    assert.equal(written.filter(chunk => chunk === 'event: ORDER_CREATED\n').length, 1);
  } finally {
    cleanup();
  }
});

test('concurrent payment confirmations still create one order alert', async () => {
  paid = false;
  paymentUpdates = 0;
  pushLookups = 0;
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
    assert.equal(pushLookups, 1);
    assert.equal(written.filter(chunk => chunk === 'event: ORDER_CREATED\n').length, 1);
  } finally {
    cleanup();
  }
});
