import { supabase, type Row, logSupabaseError, nowIso } from '../db/connection.js';
import { getOrderById } from '../db/orderRepository.js';
import { sendOrderConfirmationEmail } from './OrderConfirmationEmail.js';

export type MarkOrderPaidOptions = {
  expectedAmountOre?: number;
  paidAmountOre?: number;
};

/**
 * Sets payment_status to paid (idempotent) and sends confirmation email when applicable.
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

  if (expectedOre > 0 && paidOre != null && paidOre !== expectedOre) {
    console.error('[markOrderPaid] amount mismatch', { orderId, paidOre, expectedOre });
    return false;
  }

  const { data, error } = await supabase
    .from('orders')
    .update({ payment_status: 'paid', updated_at: nowIso() })
    .eq('id', orderId)
    .eq('payment_status', 'pending')
    .select('id');

  if (error) {
    logSupabaseError('markOrderPaid', error);
    throw error;
  }

  if (!data || data.length === 0) return false;

  const refreshed = await getOrderById(orderId);
  if (!refreshed) return true;

  const emailOut = String(refreshed.order.customer_email ?? '').trim();
  if (emailOut) {
    void sendOrderConfirmationEmail({ order: refreshed.order, items: refreshed.items }).catch((err) =>
      console.error('[order confirmation email after payment]', err)
    );
  }

  return true;
}

export async function getOrderIdBySwishInstructionId(instructionId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('orders')
    .select('id')
    .eq('swish_instruction_id', instructionId)
    .limit(1)
    .maybeSingle();

  if (error) {
    logSupabaseError('getOrderIdBySwishInstructionId', error);
    throw error;
  }

  if (!data) return null;
  return String((data as Row).id ?? '');
}
