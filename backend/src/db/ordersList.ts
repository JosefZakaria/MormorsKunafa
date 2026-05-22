import type { Row } from './connection.js';
import { getOrderById } from './orderRepository.js';
import { dbTimestampToIso } from '../utils/dbTimestamp.js';

export async function rowsToOrders(orderRows: Row[]): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (const o of orderRows) {
    const full = await getOrderById(String(o.id));
    if (full) {
      out.push(orderRowToOrder(full.order, full.items));
    }
  }
  return out;
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
    items: items.map((i) => ({
      productId: i.product_id ?? '',
      productName: i.product_name_snapshot,
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
