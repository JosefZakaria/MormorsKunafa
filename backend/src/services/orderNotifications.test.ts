import assert from 'node:assert/strict';
import test from 'node:test';
import type { Row } from '../db/connection.js';
import {
  notifyPaidOrderCreatedEvent,
  type PaidOrderNotificationChannel,
} from './orderNotifications.js';

test('contains independent realtime and push failures after a paid order is durable', async () => {
  const attempted: PaidOrderNotificationChannel[] = [];
  const reported: PaidOrderNotificationChannel[] = [];
  const eventIds = new Set<string>();

  await assert.doesNotReject(notifyPaidOrderCreatedEvent(
    '00000000-0000-4000-8000-000000000001',
    '#1001',
    { order_type: 'takeaway', location_id: 'hoja' } as Row,
    {
      broadcast: async (event) => {
        attempted.push('realtime');
        eventIds.add(event.event_id);
        assert.equal(event.order_id, '00000000-0000-4000-8000-000000000001');
        throw new Error('synthetic realtime failure');
      },
      push: async (event) => {
        attempted.push('push');
        eventIds.add(event.event_id);
        throw new Error('synthetic push failure');
      },
      reportFailure: (channel, event) => {
        reported.push(channel);
        eventIds.add(event.event_id);
      },
    }
  ));

  assert.deepEqual(attempted.sort(), ['push', 'realtime']);
  assert.deepEqual(reported.sort(), ['push', 'realtime']);
  assert.equal(eventIds.size, 1, 'every channel must describe the same paid order event');
});
