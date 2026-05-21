import type { Order } from '@shared/types';

export function isAwaitingOnlinePayment(order: Order): boolean {
  const m = order.paymentMethod;
  const online = m === 'card' || m === 'swish' || m === 'app';
  return online && order.paymentStatus === 'pending';
}
