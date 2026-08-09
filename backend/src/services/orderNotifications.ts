import { generateId, nowIso } from '../db/connection.js';
import { broadcastOrderCreated, type OrderCreatedEvent } from './realtimeEvents.js';
import { sendOrderCreatedPush } from './pushNotifications.js';
import { safeErrorMetadata } from '../utils/safeErrorMetadata.js';

/** Notify authenticated admin clients only after an order has been paid. */
export function dispatchPaidOrderCreatedEvent(orderId: string, orderNumber: string): void {
  const event: OrderCreatedEvent = {
    event_id: generateId(),
    event_type: 'ORDER_CREATED',
    order_id: orderId,
    order_number: orderNumber,
    created_at: nowIso(),
  };

  broadcastOrderCreated(event);
  void sendOrderCreatedPush(event).catch((error) => {
    console.error('[push] sendOrderCreatedPush failed', {
      eventId: event.event_id,
      orderId,
      ...safeErrorMetadata(error),
    });
  });
}
