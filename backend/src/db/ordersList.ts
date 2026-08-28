import { supabase, type Row, logSupabaseError } from './connection.js';
import { dbTimestampToIso } from '../utils/dbTimestamp.js';
import { sanitizeProductName } from '../utils/sanitizeProductName.js';

const ITEM_ID_CHUNK = 80;
const ITEM_PAGE_SIZE = 1000;

async function fetchItemsForOrderIds(orderIds: string[]): Promise<Map<string, Row[]>> {
  const itemsByOrderId = new Map<string, Row[]>();
  if (orderIds.length === 0) return itemsByOrderId;

  for (let i = 0; i < orderIds.length; i += ITEM_ID_CHUNK) {
    const chunk = orderIds.slice(i, i + ITEM_ID_CHUNK);
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('order_items')
        .select('*')
        .in('order_id', chunk)
        .range(from, from + ITEM_PAGE_SIZE - 1);

      if (error) {
        logSupabaseError('rowsToOrders items', error);
        throw error;
      }

      const rows = (data ?? []) as Row[];
      for (const item of rows) {
        const oid = String(item.order_id ?? '');
        const list = itemsByOrderId.get(oid) ?? [];
        list.push(item);
        itemsByOrderId.set(oid, list);
      }

      if (rows.length < ITEM_PAGE_SIZE) break;
      from += ITEM_PAGE_SIZE;
    }
  }

  return itemsByOrderId;
}

export async function rowsToOrders(orderRows: Row[]): Promise<Record<string, unknown>[]> {
  if (orderRows.length === 0) return [];

  const itemsByOrderId = await fetchItemsForOrderIds(orderRows.map((o) => String(o.id)));
  return orderRows.map((o) => orderRowToOrder(o, itemsByOrderId.get(String(o.id)) ?? []));
}

export function orderRowToOrder(r: Row, items: Row[]): Record<string, unknown> {
  const deliveryInfo =
    r.delivery_info_json != null
      ? typeof r.delivery_info_json === 'string'
        ? JSON.parse(r.delivery_info_json as string)
        : r.delivery_info_json
      : undefined;
  const customerInfo =
    r.customer_name || r.customer_phone || r.customer_email
      ? {
          name: (r.customer_name as string) ?? '',
          phone: (r.customer_phone as string) ?? '',
          ...(r.customer_email ? { email: r.customer_email as string } : {}),
        }
      : undefined;

  return {
    id: r.id,
    orderNumber: r.order_number,
    status: r.status,
    orderType: r.order_type,
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status,
    totalPrice: r.total_ore,
    defaultPreparationTime: r.default_preparation_time_minutes,
    estimatedReadyTime: dbTimestampToIso(r.estimated_ready_at),
    scheduledTime: dbTimestampToIso(r.scheduled_at),
    customerInfo,
    deliveryInfo,
    createdAt: dbTimestampToIso(r.created_at),
    updatedAt: dbTimestampToIso(r.updated_at),
    startedAt: dbTimestampToIso(r.started_at),
    completedAt: dbTimestampToIso(r.completed_at),
    cancellationReason: r.cancellation_reason ?? undefined,
    cancelledAt: dbTimestampToIso(r.cancelled_at),
    refundStatus: r.refund_status ?? 'none',
    internalNotes: r.internal_notes ?? undefined,
    locationId: r.location_id != null ? String(r.location_id) : null,
    items: items.map((i) => ({
      productId: i.product_id ?? '',
      productName: sanitizeProductName(String(i.product_name_snapshot ?? '')),
      quantity: i.quantity,
      price: i.price_ore,
      modifications:
        i.modifications_json != null
          ? typeof i.modifications_json === 'string'
            ? JSON.parse(i.modifications_json as string)
            : i.modifications_json
          : undefined,
    })),
  };
}
