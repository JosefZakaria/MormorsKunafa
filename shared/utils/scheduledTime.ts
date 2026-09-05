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

function formatClock(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function stockholmHoursMinutes(at: Date): { hours: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: STOCKHOLM_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  return {
    hours: Number(parts.find((part) => part.type === 'hour')?.value),
    minutes: Number(parts.find((part) => part.type === 'minute')?.value),
  };
}

/** YYYY-MM-DD for a Date in Europe/Stockholm. */
export function dateToStockholmInputValue(at: Date = new Date()): string {
  return at.toLocaleDateString('sv-SE', { timeZone: STOCKHOLM_TZ });
}

export function todayInStockholmDateString(at: Date = new Date()): string {
  return dateToStockholmInputValue(at);
}

/** Snap "HH:mm" up to the next 5-minute slot (picker increment). */
export function roundClockToNext5Min(clock: string): string {
  const normalized = String(clock).replace('.', ':').slice(0, 5);
  const [hStr, mStr] = normalized.split(':');
  const hours = parseInt(hStr, 10);
  const minutes = parseInt(mStr, 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return formatClock(0, 0);

  const roundedMinutes = Math.ceil(minutes / 5) * 5;
  if (roundedMinutes >= 60) {
    return formatClock((hours + 1) % 24, 0);
  }
  return formatClock(hours, roundedMinutes);
}

/**
 * Earliest selectable clock today: now + leadMinutes in Stockholm,
 * rounded up to the next 5-minute slot. Returns "HH:mm".
 */
export function defaultScheduledClock(
  leadMinutes = DEFAULT_ORDER_LEAD_MINUTES,
  at: Date = new Date()
): string {
  const target = new Date(at.getTime() + leadMinutes * 60 * 1000);
  const { hours, minutes } = stockholmHoursMinutes(target);
  return roundClockToNext5Min(formatClock(hours, minutes));
}
