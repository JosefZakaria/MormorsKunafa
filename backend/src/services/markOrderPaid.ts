import { supabase, type Row, logSupabaseError, nowIso } from '../db/connection.js';
import { getOrderById } from '../db/orderRepository.js';
import { sendOrderConfirmationEmail } from './OrderConfirmationEmail.js';
import { sendSms } from './SmsService.js';
import { formatStockholmDateTime } from '../utils/stockholmWallTime.js';
import { isOnlinePayment } from '../utils/paymentMethod.js';
import { dispatchPaidOrderCreatedEvent } from './orderNotifications.js';
import { logUnexpectedError } from '../utils/safeErrorMetadata.js';

export type MarkOrderPaidOptions = {
  expectedAmountOre?: number;
  paidAmountOre?: number;
};

/**
 * Sets payment_status to paid (idempotent) and sends confirmation email/SMS when applicable.
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
  const { data, error } = await supabase
    .from('orders')
    .update({ payment_status: 'paid', updated_at: paidAt })
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

  dispatchPaidOrderCreatedEvent(
    orderId,
    String(refreshed.order.order_number ?? '')
  );

  const emailOut = String(refreshed.order.customer_email ?? '').trim();
  if (emailOut) {
    void sendOrderConfirmationEmail({
      order: refreshed.order,
      items: refreshed.items,
      paidAt,
    }).catch((err) =>
      logUnexpectedError('order confirmation email after payment', err)
    );
  }

  const phoneOut = String(refreshed.order.customer_phone ?? '').trim();
  const smsCustomerName = String(refreshed.order.customer_name ?? '').trim();
  // Hemleverans får inga SMS – endast "Ta med" och "Äta här".
  if (phoneOut && String(refreshed.order.order_type ?? '') !== 'delivery') {
    const schedStr = refreshed.order.scheduled_at ? formatStockholmDateTime(refreshed.order.scheduled_at as string) : '';
    const schedSuffix = schedStr ? ` Planerad upphämtning: ${schedStr}.` : '';
    void sendSms(phoneOut, `Tack för din beställning från Mormors Kunafa${smsCustomerName ? ', ' + smsCustomerName : ''}! Vi tar snart emot din beställning.${schedSuffix}`).catch((err) =>
      logUnexpectedError('order confirmation sms after payment', err)
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
