import assert from 'node:assert/strict';
import test from 'node:test';
import type { OutboundMessageFailureAlert } from '@mormors-kunafa/shared/types';
import type { Row } from './connection.js';
import { outboundMessageFailureAlertsFromRows } from './outboundMessageAlertsRepository.js';
import type { AdminScope } from '../services/locationScope.js';

const owner: AdminScope = {
  adminId: 'owner-test',
  role: 'owner',
  locationId: null,
  fulfillsDelivery: false,
};
const hoja: AdminScope = {
  adminId: 'hoja-test',
  role: 'location',
  locationId: 'hoja',
  fulfillsDelivery: true,
};
const mollevangen: AdminScope = {
  adminId: 'mollevangen-test',
  role: 'location',
  locationId: 'mollevangen',
  fulfillsDelivery: false,
};

const HOJA_ORDER_ID = '5d2c7639-88d9-43f1-ae7c-20367ea82d58';
const MOLLEVANGEN_ORDER_ID = 'fbbc514a-734d-4819-801c-a44193a8f377';
const DELIVERY_ORDER_ID = '08868d43-f29c-4285-8caf-7f16914d6416';

const orders: Row[] = [
  { id: HOJA_ORDER_ID, order_number: '#1001', order_type: 'takeaway', location_id: 'hoja' },
  { id: MOLLEVANGEN_ORDER_ID, order_number: '#1002', order_type: 'takeaway', location_id: 'mollevangen' },
  { id: DELIVERY_ORDER_ID, order_number: '#1003', order_type: 'delivery', location_id: null },
];

function job(overrides: Row = {}): Row {
  return {
    id: '5d37324e-2660-4ac2-8c38-832003e07b7c',
    order_id: HOJA_ORDER_ID,
    event_key: 'order_confirmation',
    channel: 'email',
    status: 'retryable',
    attempt_count: 1,
    max_attempts: 5,
    last_error_code: 'provider_unavailable',
    updated_at: '2026-09-12T10:15:00.000Z',
    ...overrides,
  };
}

test('outbound failure alerts expose only the stable safe DTO', () => {
  const unsafeRow = job({
    message_data: { email: 'buyer@example.test', phone: '+46700000000' },
    provider_message_id: 'provider-secret',
    last_http_status: 503,
  });
  const alerts = outboundMessageFailureAlertsFromRows([unsafeRow], orders, owner, 50);

  assert.deepEqual(alerts, [{
    id: String(unsafeRow.id),
    orderNumber: '#1001',
    channel: 'email',
    event: 'order_confirmation',
    status: 'retryable',
    attemptCount: 1,
    maxAttempts: 5,
    errorCode: 'provider_unavailable',
    updatedAt: '2026-09-12T10:15:00.000Z',
  } satisfies OutboundMessageFailureAlert]);
  assert.deepEqual(Object.keys(alerts[0]).sort(), [
    'attemptCount', 'channel', 'errorCode', 'event', 'id',
    'maxAttempts', 'orderNumber', 'status', 'updatedAt',
  ]);
  assert(!JSON.stringify(alerts).includes('buyer@example.test'));
  assert(!JSON.stringify(alerts).includes('provider-secret'));
});

test('location staff see only their order scope while the owner sees all locations', () => {
  const jobs = [
    job(),
    job({
      id: '010a293d-0de7-4b25-89a2-fe33d3d7dc46',
      order_id: MOLLEVANGEN_ORDER_ID,
      channel: 'sms',
      status: 'uncertain',
    }),
    job({
      id: '8942c73e-46ef-40ad-8ca4-144b8414ca2f',
      order_id: DELIVERY_ORDER_ID,
      event_key: 'order_accepted',
      channel: 'sms',
      status: 'permanent_failed',
      attempt_count: 5,
    }),
  ];

  assert.deepEqual(
    outboundMessageFailureAlertsFromRows(jobs, orders, owner, 50).map((alert) => alert.orderNumber),
    ['#1001', '#1002', '#1003']
  );
  assert.deepEqual(
    outboundMessageFailureAlertsFromRows(jobs, orders, hoja, 50).map((alert) => alert.orderNumber),
    ['#1001', '#1003']
  );
  assert.deepEqual(
    outboundMessageFailureAlertsFromRows(jobs, orders, mollevangen, 50).map((alert) => alert.orderNumber),
    ['#1002']
  );
});

test('only unresolved failure states survive and unsafe error codes are replaced', () => {
  const alerts = outboundMessageFailureAlertsFromRows([
    job({ id: '8043d6ca-4536-46dc-a42d-76fd91519843', status: 'pending' }),
    job({ id: '7f10dc5e-58dd-47e0-bf94-8f8156786ec0', status: 'processing' }),
    job({ id: 'ce479be6-bd5d-4cc6-9e83-53688aaab638', status: 'succeeded' }),
    job({ id: '7b360b86-44ef-4ed2-a8ac-fea1f1fd19d5', status: 'uncertain', last_error_code: 'raw provider response!' }),
  ], orders, owner, 50);

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].status, 'uncertain');
  assert.equal(alerts[0].errorCode, 'unknown_delivery_error');
});
