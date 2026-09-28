import { isOnlinePayment } from './paymentMethod.js';

type PaymentState = { status?: unknown; payment_method?: unknown; payment_status?: unknown; refund_status?: unknown };

export function canStartOrderPayment(order: PaymentState): boolean {
  return order.status === 'ny' && order.payment_status === 'pending';
}

export function canCancelOrderPayment(order: PaymentState): boolean {
  return !isOnlinePayment(String(order.payment_method ?? '')) ||
    (order.payment_status === 'paid' && order.refund_status === 'refunded');
}
