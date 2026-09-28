import { generateId, nowIso, type Row } from '../db/connection.js';
import type { OrderType } from '@mormors-kunafa/shared/types';
import { broadcastOrderCreated, type OrderCreatedEvent } from './realtimeEvents.js';
import { sendOrderCreatedPush } from './pushNotifications.js';
import { safeErrorMetadata } from '../utils/safeErrorMetadata.js';

export type PaidOrderNotificationChannel = 'realtime' | 'push';

export type PaidOrderNotificationDependencies = {
  broadcast: (event: OrderCreatedEvent) => Promise<void>;
  push: (event: OrderCreatedEvent) => Promise<void>;
  reportFailure: (
    channel: PaidOrderNotificationChannel,
    event: OrderCreatedEvent,
    error: unknown
  ) => void;
};

const defaultDependencies: PaidOrderNotificationDependencies = {
  broadcast: broadcastOrderCreated,
  push: sendOrderCreatedPush,
  reportFailure: (channel, event, error) => {
    console.error(`[${channel}] paid order notification failed`, {
      eventId: event.event_id,
      orderId: event.order_id,
      ...safeErrorMetadata(error),
    });
  },
};

/**
 * Attempt every transient notification channel after payment. Rejections are
 * reported but contained: the durable staff queue is read from PostgreSQL and
 * must never depend on realtime, push, email or SMS delivery.
 */
export async function notifyPaidOrderCreatedEvent(
  orderId: string,
  orderNumber: string,
  order: Row,
  dependencies: PaidOrderNotificationDependencies = defaultDependencies
): Promise<void> {
  const event: OrderCreatedEvent = {
    event_id: generateId(),
    event_type: 'ORDER_CREATED',
    order_id: orderId,
    order_number: orderNumber,
    created_at: nowIso(),
    order_type: String(order.order_type) as OrderType,
    location_id: order.location_id == null ? null : String(order.location_id),
  };

  const results = await Promise.allSettled([
    Promise.resolve().then(() => dependencies.broadcast(event)),
    Promise.resolve().then(() => dependencies.push(event)),
  ]);
  const channels: PaidOrderNotificationChannel[] = ['realtime', 'push'];
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      dependencies.reportFailure(channels[index], event, result.reason);
    }
  });
}

/** Notify authenticated admin clients only after an order has been paid. */
export function dispatchPaidOrderCreatedEvent(orderId: string, orderNumber: string, order: Row): void {
  void notifyPaidOrderCreatedEvent(orderId, orderNumber, order).catch((error) => {
    console.error('[notifications] paid order dispatch failed unexpectedly', {
      orderId,
      ...safeErrorMetadata(error),
    });
  });
}
