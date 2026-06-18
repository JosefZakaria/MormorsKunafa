/** Minimum lead time before the earliest selectable slot (matches default prep time). */
export const DEFAULT_ORDER_LEAD_MINUTES = 30;

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
