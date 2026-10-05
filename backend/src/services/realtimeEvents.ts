import type { Response } from 'express';
import type { OrderType } from '@mormors-kunafa/shared/types';
import type { AdminScope } from './locationScope.js';
import { orderNotificationVisibleToScope } from './locationScope.js';
import { sendOrderCreatedPush } from './pushNotifications.js';

export type OrderCreatedEvent = {
  event_id: string;
  event_type: 'ORDER_CREATED';
  order_id: string;
  order_number: string;
  created_at: string;
  order_type: OrderType;
  location_id: string | null;
  location_accounts_only?: boolean;
};

type Client = {
  id: string;
  adminId: string;
  scope: AdminScope;
  res: Response;
};

const clients = new Map<string, Client>();

function sseWrite(res: Response, event: string, payload: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function registerRealtimeClient(scope: AdminScope, res: Response): () => void {
  const clientId = crypto.randomUUID();
  clients.set(clientId, { id: clientId, adminId: scope.adminId, scope, res });

  sseWrite(res, 'ready', {
    ok: true,
    connected_at: new Date().toISOString(),
  });

  const heartbeat = setInterval(() => {
    try {
      sseWrite(res, 'ping', { ts: new Date().toISOString() });
    } catch {
      // Connection is closed; cleanup runs on request close.
    }
  }, 25000);

  return () => {
    clearInterval(heartbeat);
    clients.delete(clientId);
  };
}

export function broadcastOrderCreated(event: OrderCreatedEvent): void {
  for (const client of clients.values()) {
    if (
      !orderNotificationVisibleToScope(client.scope, {
        orderType: event.order_type,
        locationId: event.location_id,
        locationAccountsOnly: event.location_accounts_only,
      })
    ) {
      continue;
    }
    sseWrite(client.res, 'ORDER_CREATED', event);
  }
}

function asOrderType(value: string): OrderType {
  if (value === 'eat-here' || value === 'takeaway' || value === 'delivery') return value;
  return 'takeaway';
}

export function dispatchOrderCreatedEvent(
  orderId: string,
  orderNumber: string,
  orderType: string,
  locationId: string | null,
  locationAccountsOnly = false
): void {
  const event: OrderCreatedEvent = {
    event_id: crypto.randomUUID(),
    event_type: 'ORDER_CREATED',
    order_id: orderId,
    order_number: orderNumber,
    created_at: new Date().toISOString(),
    order_type: asOrderType(orderType),
    location_id: locationId,
    ...(locationAccountsOnly ? { location_accounts_only: true } : {}),
  };

  broadcastOrderCreated(event);
  void sendOrderCreatedPush(event).catch((error) => {
    console.error('[push] sendOrderCreatedPush failed', {
      eventId: event.event_id,
      orderId: orderId,
      error,
    });
  });
}

/** Silent refresh for the owner's monitoring view; acceptance does not send a push. */
export function dispatchPhoneOrderAcceptedEvent(orderId: string, locationId: string | null): void {
  const event = { event_id: crypto.randomUUID(), order_id: orderId, location_id: locationId };
  for (const client of clients.values()) {
    if (client.scope.role === 'owner') sseWrite(client.res, 'PHONE_ORDER_ACCEPTED', event);
  }
}

export function getRealtimeStatus(): { totalClients: number; byAdmin: Record<string, number> } {
  const byAdmin: Record<string, number> = {};
  for (const client of clients.values()) {
    byAdmin[client.adminId] = (byAdmin[client.adminId] ?? 0) + 1;
  }
  return {
    totalClients: clients.size,
    byAdmin,
  };
}
