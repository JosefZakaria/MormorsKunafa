import { supabase, type Row, logSupabaseError, nowIso } from './connection.js';

export async function getOrderById(id: string): Promise<{ order: Row; items: Row[] } | null> {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (orderError) {
    logSupabaseError('getOrderById order', orderError);
    throw orderError;
  }
  if (!order) return null;

  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', id);

  if (itemsError) {
    logSupabaseError('getOrderById items', itemsError);
    throw itemsError;
  }

  return { order: order as Row, items: (items ?? []) as Row[] };
}

export type AtomicOrderItem = {
  id: string;
  product_id: string | null;
  product_name_snapshot: string;
  quantity: number;
  price_ore: number;
  modifications_json: null | Record<string, unknown>;
};

export async function createOrderAtomic(
  order: Record<string, unknown>,
  items: AtomicOrderItem[]
): Promise<{ orderId: string; orderNumber: string; totalOre: number }> {
  const { data, error } = await supabase.rpc('create_order_atomic', {
    p_order: order,
    p_items: items,
  });

  if (error) {
    logSupabaseError('createOrderAtomic', error);
    throw error;
  }

  const row = Array.isArray(data) ? (data[0] as Row | undefined) : undefined;
  const orderId = String(row?.order_id ?? '');
  const orderNumber = String(row?.order_number ?? '');
  const totalOre = Number(row?.total_ore);
  if (!orderId || !/^#[0-9]+$/.test(orderNumber) || !Number.isSafeInteger(totalOre) || totalOre <= 0) {
    throw new Error('Atomic order creation returned an invalid result');
  }

  return { orderId, orderNumber, totalOre };
}

export async function fetchOrderRow(id: string): Promise<Row | null> {
  const { data, error } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
  if (error) {
    logSupabaseError('fetchOrderRow', error);
    throw error;
  }
  return data ? (data as Row) : null;
}

export async function updateOrder(
  id: string,
  patch: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ ...patch, updated_at: nowIso() })
    .eq('id', id);

  if (error) {
    logSupabaseError('updateOrder', error);
    throw error;
  }
}

export async function compareAndUpdateOrder(
  id: string,
  expectedStatus: string,
  patch: Record<string, unknown>
): Promise<boolean> {
  const { data, error } = await supabase
    .from('orders')
    .update({ ...patch, updated_at: nowIso() })
    .eq('id', id)
    .eq('status', expectedStatus)
    .select('id');

  if (error) {
    logSupabaseError('compareAndUpdateOrder', error);
    throw error;
  }

  return Array.isArray(data) && data.length === 1;
}
