import { randomUUID } from 'node:crypto';
import { supabase, type Row, logSupabaseError, nowIso } from '../db/connection.js';
import { getOrderById } from '../db/orderRepository.js';
import { isOnlinePayment } from '../utils/paymentMethod.js';
import { dispatchPaidOrderCreatedEvent } from './orderNotifications.js';
import { swishInstructionIdCandidates } from './swishClient.js';

export type MarkOrderPaidOptions = {
  expectedAmountOre?: number;
  paidAmountOre?: number;
};

/**
 * Sets payment_status to paid and creates durable customer-message jobs atomically.
 * @returns true if the order was newly marked paid
 */
export async function markOrderPaid(orderId: string, options?: MarkOrderPaidOptions): Promise<boolean> {
  const result = await getOrderById(orderId);
  if (!result) {
    console.warn('[markOrderPaid] order not found', orderId);
    return false;
  }

  const expectedOre = options?.expectedAmountOre ?? Number(result.order.total_ore ?? 0);
  const paidOre = options?.paidAmountOre;
  const paymentMethod = String(result.order.payment_method ?? '');

  if (!Number.isSafeInteger(expectedOre) || expectedOre <= 0) {
    console.error('[markOrderPaid] invalid expected amount', { orderId, expectedOre });
    return false;
  }

  if (isOnlinePayment(paymentMethod) && !Number.isSafeInteger(paidOre)) {
    console.error('[markOrderPaid] verified paid amount required', { orderId });
    return false;
  }

  if (paidOre != null && paidOre !== expectedOre) {
    console.error('[markOrderPaid] amount mismatch', { orderId, paidOre, expectedOre });
    return false;
  }

  const paidAt = nowIso();
  const { data, error } = await supabase.rpc('mark_order_paid_with_audit_and_messages', {
    p_order_id: orderId,
    p_paid_at: paidAt,
    p_event_id: randomUUID(),
  });

  if (error) {
    logSupabaseError('markOrderPaid', error);
    throw error;
  }

  if (data !== true) return false;

  const refreshed = await getOrderById(orderId);
  if (!refreshed) return true;

  dispatchPaidOrderCreatedEvent(
    orderId,
    String(refreshed.order.order_number ?? ''),
    refreshed.order
  );

  return true;
}

export async function getOrderIdBySwishInstructionId(instructionId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('orders')
    .select('id')
    .in('swish_instruction_id', swishInstructionIdCandidates(instructionId))
    .limit(2);

  if (error) {
    logSupabaseError('getOrderIdBySwishInstructionId', error);
    throw error;
  }

  if (!data?.length) return null;
  if (data.length !== 1) throw new Error('Swish instruction matches multiple orders');
  return String((data[0] as Row).id ?? '');
}
