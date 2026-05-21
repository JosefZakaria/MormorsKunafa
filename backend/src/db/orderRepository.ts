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

export async function getNextOrderNumber(): Promise<string> {
  const { data, error } = await supabase
    .from('orders')
    .select('order_number')
    .like('order_number', '#%');

  if (error) {
    logSupabaseError('getNextOrderNumber', error);
    throw error;
  }

  let max = 0;
  for (const row of data ?? []) {
    const raw = String((row as Row).order_number ?? '');
    const n = parseInt(raw.replace(/^#/, ''), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `#${String(max + 1).padStart(4, '0')}`;
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
