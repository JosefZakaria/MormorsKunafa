import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { OrderType } from '@mormors-kunafa/shared/types';
import { supabase, logSupabaseError } from '../db/connection.js';
import { dbTimestampToIso } from '../utils/dbTimestamp.js';
import { getOrderIncomingAt } from '../shared/utils/scheduledTime.js';
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
  reminder?: boolean;
};

/** Admin screens listen here; a database trigger broadcasts an empty signal on every order change. */
export const ADMIN_ORDERS_TOPIC = 'admin-orders';
const REALTIME_TOKEN_TTL_SECONDS = 15 * 60;

/**
 * Listen-only Realtime token. Role anon has no table grants, and mk_admin only unlocks the
 * empty order signal on ADMIN_ORDERS_TOPIC (see migration 20261111230000_admin_order_signals).
 */
export function createAdminRealtimeToken(adminId: string):
  { url: string; apiKey: string; token: string; topic: string; expiresIn: number } | null {
  const secret = process.env.SUPABASE_JWT_SECRET?.trim();
  const url = process.env.SUPABASE_URL?.trim();
  const apiKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  // Never hand the service key to a browser, even if it is pasted into the wrong variable.
  if (!secret || !url || !apiKey || apiKey === process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return null;
  const token = jwt.sign({ role: 'anon', mk_admin: true }, secret, {
    algorithm: 'HS256',
    expiresIn: REALTIME_TOKEN_TTL_SECONDS,
    subject: adminId,
  });
  return { url, apiKey, token, topic: ADMIN_ORDERS_TOPIC, expiresIn: REALTIME_TOKEN_TTL_SECONDS };
}

function asOrderType(value: string): OrderType {
  if (value === 'eat-here' || value === 'takeaway' || value === 'delivery') return value;
  return 'takeaway';
}

/** Screens refresh from the database trigger; this only sends the push notification. */
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

  void sendOrderCreatedPush(event).catch((error) => {
    console.error('[push] sendOrderCreatedPush failed', {
      eventId: event.event_id,
      orderId: orderId,
      error,
    });
  });
}

const REMINDER_AFTER_MS = 3 * 60_000;
// Orders left unaccepted for hours are history, not an emergency; never ping about them.
const REMINDER_WINDOW_MS = 2 * 60 * 60_000;

/** Push log event ids are uuids; one stable id per order makes the reminder fire once. */
export function reminderEventId(orderId: string): string {
  const h = createHash('sha1').update(`${orderId}:reminder`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

type QueueRow = { created_at: unknown; scheduled_at: unknown };

/** When the order entered the kitchen queue: creation, or pickup minus the pre-order lead time. */
function queuedAtMs(row: QueueRow): number {
  const created = Date.parse(dbTimestampToIso(row.created_at) ?? '');
  const released = getOrderIncomingAt(dbTimestampToIso(row.scheduled_at)) ?? 0;
  return Math.max(Number.isNaN(created) ? 0 : created, released);
}

export function needsReminder(row: QueueRow, now: number): boolean {
  const waited = now - queuedAtMs(row);
  return waited >= REMINDER_AFTER_MS && waited <= REMINDER_WINDOW_MS;
}

/** Pushes one "still waiting" notification per order left in the incoming queue. Returns how many orders. */
export async function sendUnacceptedOrderReminders(now = Date.now()): Promise<number> {
  const since = new Date(now - REMINDER_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number, order_type, location_id, payment_method, payment_status, created_at, scheduled_at')
    .eq('status', 'ny')
    .or(`created_at.gte.${since},scheduled_at.gte.${since}`);
  if (error) {
    logSupabaseError('sendUnacceptedOrderReminders', error);
    throw error;
  }

  // Same queue as GET /orders/admin/pending: unpaid online orders are not in it yet.
  const due = (data ?? []).filter((row) =>
    (row.payment_status === 'paid' || row.payment_method === 'pay_at_pickup') && needsReminder(row, now));
  await Promise.all(due.map((row) => sendOrderCreatedPush({
    event_id: reminderEventId(String(row.id)),
    event_type: 'ORDER_CREATED',
    order_id: String(row.id),
    order_number: String(row.order_number ?? ''),
    created_at: new Date(now).toISOString(),
    order_type: asOrderType(String(row.order_type ?? '')),
    location_id: row.location_id != null ? String(row.location_id) : null,
    // Phone orders are pay_at_pickup and only the receiving location accepts them.
    ...(row.payment_method === 'pay_at_pickup' ? { location_accounts_only: true } : {}),
    reminder: true,
  })));
  return due.length;
}
