/** Kitchen ticket outcomes are local to the one tablet connected to Höja's printer. */
import type { Order } from '@shared/types';
import { isKitchenTicketPrintDue } from '@shared/utils/scheduledTime';
import { getOrderTargetLocationSlug, isPrinterConfigured } from './printer';

export type KitchenPrintStatus = 'printing' | 'printed' | 'review';

const STATE_PREFIX = 'hoja_kitchen_print_state_v1:';
const AUTO_KEY = 'hoja_auto_print_enabled_v1';

export function getKitchenPrintStatus(orderId: string): KitchenPrintStatus | null {
  try {
    const status = localStorage.getItem(`${STATE_PREFIX}${orderId}`);
    // A page reload during an in-flight request has an unknown physical outcome.
    return status === 'printing' ? 'review' : status === 'printed' || status === 'review' ? status : null;
  } catch {
    // If storage is unavailable, never resume automatic printing blindly.
    return 'review';
  }
}

export function setKitchenPrintStatus(orderId: string, status: KitchenPrintStatus): boolean {
  try {
    localStorage.setItem(`${STATE_PREFIX}${orderId}`, status);
    return true;
  } catch (error) {
    console.error('[printer] Could not persist ticket status', { orderId, error });
    return false;
  }
}

export function isHojaAutoPrintEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setHojaAutoPrintEnabled(enabled: boolean): boolean {
  try {
    localStorage.setItem(AUTO_KEY, String(enabled));
    return true;
  } catch {
    return false;
  }
}

export function shouldAutoPrintKitchenTicket(order: Order, authorizedHojaTablet: boolean, enabled: boolean): boolean {
  return authorizedHojaTablet
    && enabled
    && order.paymentStatus === 'paid'
    && getOrderTargetLocationSlug(order) === 'hoja'
    && isPrinterConfigured('hoja')
    && isKitchenTicketPrintDue(order.scheduledTime)
    && getKitchenPrintStatus(order.id) === null;
}

/** Keep already-due orders from printing unexpectedly when this tablet is first enabled. */
export function markExistingDueTicketsForReview(orders: Order[]): boolean {
  for (const order of orders) {
    if (shouldAutoPrintKitchenTicket(order, true, true) && !setKitchenPrintStatus(order.id, 'review')) {
      return false;
    }
  }
  return true;
}
