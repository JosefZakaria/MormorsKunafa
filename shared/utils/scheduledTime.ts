/** Minimum lead time before the earliest selectable slot (matches default prep time). */
export const DEFAULT_ORDER_LEAD_MINUTES = 30;

/** How long before scheduled pickup/eat-here time the kitchen ticket should print. */
export const KITCHEN_TICKET_LEAD_MINUTES = 30;

/**
 * Whether the kitchen ticket should print now.
 * - No scheduled time (e.g. delivery): print immediately.
 * - With scheduled time: print once `scheduledTime - leadMinutes` has passed.
 */
export function isKitchenTicketPrintDue(
  scheduledTime: string | null | undefined,
  at: Date = new Date(),
  leadMinutes = KITCHEN_TICKET_LEAD_MINUTES
): boolean {
  if (scheduledTime == null || String(scheduledTime).trim() === '') return true;
  const scheduledMs = new Date(scheduledTime).getTime();
  if (Number.isNaN(scheduledMs)) return true;
  return at.getTime() >= scheduledMs - leadMinutes * 60 * 1000;
}

const STOCKHOLM_TZ = 'Europe/Stockholm';

/** YYYY-MM-DD for a Date in Europe/Stockholm. */
export function dateToStockholmInputValue(at: Date = new Date()): string {
  return at.toLocaleDateString('sv-SE', { timeZone: STOCKHOLM_TZ });
}

export function todayInStockholmDateString(at: Date = new Date()): string {
  return dateToStockholmInputValue(at);
}

/**
 * Earliest selectable clock today: now + leadMinutes in Stockholm, rounded up to the next minute.
 * Returns "HH:mm".
 */
export function defaultScheduledClock(
  leadMinutes = DEFAULT_ORDER_LEAD_MINUTES,
  at: Date = new Date()
): string {
  const targetMs = at.getTime() + leadMinutes * 60 * 1000;
  const roundedMs = Math.ceil(targetMs / 60_000) * 60_000;
  return new Date(roundedMs).toLocaleTimeString('sv-SE', {
    timeZone: STOCKHOLM_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
