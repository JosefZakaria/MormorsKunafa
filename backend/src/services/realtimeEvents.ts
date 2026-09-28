import type { Response } from 'express';
import type { OrderType } from '@mormors-kunafa/shared/types';
import type { AdminScope } from './locationScope.js';
import { orderVisibleToScope } from './locationScope.js';

export type OrderCreatedEvent = {
  event_id: string;
  event_type: 'ORDER_CREATED';
  order_id: string;
  order_number: string;
  created_at: string;
  order_type: OrderType;
  location_id: string | null;
};

type Client = {
  id: string;
  adminId: string;
  scope: AdminScope;
  refreshScope: () => Promise<AdminScope>;
  res: Response;
};

const clients = new Map<string, Client>();

function sseWrite(res: Response, event: string, payload: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function registerRealtimeClient(scope: AdminScope, res: Response, refreshScope: () => Promise<AdminScope>): () => void {
  const clientId = crypto.randomUUID();
  clients.set(clientId, { id: clientId, adminId: scope.adminId, scope, res, refreshScope });

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

  const cleanup = () => {
    clearInterval(heartbeat);
    clients.delete(clientId);
  };
  const expiry = setTimeout(() => { cleanup(); res.end(); }, 60_000);
  return () => { clearTimeout(expiry); cleanup(); };
}

export async function broadcastOrderCreated(event: OrderCreatedEvent): Promise<void> {
  await Promise.allSettled([...clients.values()].map(async client => {
    try { client.scope = await client.refreshScope(); }
    catch { clients.delete(client.id); client.res.end(); return; }
    if (!clients.has(client.id)) return;
    if (
      !orderVisibleToScope(client.scope, {
        orderType: event.order_type,
        locationId: event.location_id,
      })
    ) {
      return;
    }
    sseWrite(client.res, 'ORDER_CREATED', event);
  }));
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
