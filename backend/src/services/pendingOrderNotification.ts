import { supabase, logSupabaseError } from '../db/connection.js';
import { loadAdminScope } from './locationScope.js';

/** Same paid/new queue and delivery responsibility as the dashboard, without order data. */
export async function shouldNotifyPendingOrder(adminId: string, tokenVersion: number): Promise<boolean> {
  const scope = await loadAdminScope(adminId, tokenVersion);
  const pending = () => supabase.from('orders').select('id')
    .eq('status', 'ny').eq('payment_status', 'paid').limit(1);
  const query = scope.role === 'owner'
    ? pending()
    : pending().eq('location_id', scope.locationId!).neq('order_type', 'delivery');
  const local = await query;
  if (local.error) {
    logSupabaseError('shouldNotifyPendingOrder', local.error);
    throw new Error('Pending orders unavailable');
  }
  if (local.data?.length) return true;
  if (scope.role !== 'location' || !scope.fulfillsDelivery) return false;
  const delivery = await pending().eq('order_type', 'delivery');
  if (delivery.error) {
    logSupabaseError('shouldNotifyPendingOrder delivery', delivery.error);
    throw new Error('Pending orders unavailable');
  }
  return Boolean(delivery.data?.length);
}
