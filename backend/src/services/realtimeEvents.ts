import type { Response } from 'express';

export type OrderCreatedEvent = {
  event_id: string;
  event_type: 'ORDER_CREATED';
  order_id: string;
  order_number: string;
  created_at: string;
};

type Client = {
  id: string;
  adminId: string;
  res: Response;
};

const clients = new Map<string, Client>();

function sseWrite(res: Response, event: string, payload: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function registerRealtimeClient(adminId: string, res: Response): () => void {
  const clientId = crypto.randomUUID();
  clients.set(clientId, { id: clientId, adminId, res });

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
    sseWrite(client.res, 'ORDER_CREATED', event);
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
