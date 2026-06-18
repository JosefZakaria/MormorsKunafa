/**
 * Restaurant opening hours (Europe/Stockholm). Single source of truth for
 * order-time validation and customer-facing hour labels.
 *
 * 0 = Sunday … 6 = Saturday (JavaScript weekday convention).
 */
import {
  DEFAULT_ORDER_LEAD_MINUTES,
  dateToStockholmInputValue,
  defaultScheduledClock,
  todayInStockholmDateString,
} from './scheduledTime.js';

export const STOCKHOLM_TZ = 'Europe/Stockholm';

export type DayHours = { open: string; close: string };

/** Every day 11:00–22:00 (Europe/Stockholm) — customer-facing opening hours. */
export const DEFAULT_DAY_HOURS: DayHours = { open: '11:00', close: '22:00' };

export const OPENING_HOURS_BY_WEEKDAY: Record<number, DayHours | null> = {
  0: DEFAULT_DAY_HOURS,
  1: DEFAULT_DAY_HOURS,
  2: DEFAULT_DAY_HOURS,
  3: DEFAULT_DAY_HOURS,
  4: DEFAULT_DAY_HOURS,
  5: DEFAULT_DAY_HOURS,
  6: DEFAULT_DAY_HOURS,
};

export type OpeningHoursLanguage = 'sv' | 'en' | 'ar';

function clockToMinutes(hm: string): number {
  const [h, m] = hm.slice(0, 5).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function minutesToClock(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, totalMinutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function shiftClock(hm: string, deltaMinutes: number): string {
  return minutesToClock(clockToMinutes(hm) + deltaMinutes);
}

/** First/last selectable pickup slot (open + prep buffer … close − prep buffer). */
function getOrderSlotBounds(
  hours: DayHours,
  leadMinutes = DEFAULT_ORDER_LEAD_MINUTES
): { firstSlot: string; lastSlot: string } {
  return {
    firstSlot: shiftClock(hours.open, leadMinutes),
    lastSlot: shiftClock(hours.close, -leadMinutes),
  };
}

function maxClock(a: string, b: string): string {
  return clockToMinutes(a) >= clockToMinutes(b) ? a.slice(0, 5) : b.slice(0, 5);
}

function weekdayInStockholm(dateStr: string): number {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const utcNoon = Date.UTC(y, mo - 1, d, 12, 0, 0);
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: STOCKHOLM_TZ,
    weekday: 'short',
  }).format(new Date(utcNoon));
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[wd] ?? 0;
}

export function getHoursForDate(dateStr: string): DayHours | null {
  return OPENING_HOURS_BY_WEEKDAY[weekdayInStockholm(dateStr)] ?? null;
}

/** Current clock in Europe/Stockholm as "HH:mm". */
export function currentClockInStockholm(at: Date = new Date()): string {
  return at.toLocaleTimeString('sv-SE', {
    timeZone: STOCKHOLM_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** True when the restaurant is within posted opening hours (open ≤ now < close). */
export function isRestaurantOpenNow(at: Date = new Date()): boolean {
  const todayStr = todayInStockholmDateString(at);
  const hours = getHoursForDate(todayStr);
  if (!hours) return false;
  const now = clockToMinutes(currentClockInStockholm(at));
  return now >= clockToMinutes(hours.open) && now < clockToMinutes(hours.close);
}

export function getOrderableClockRange(
  dateStr: string,
  leadMinutes = DEFAULT_ORDER_LEAD_MINUTES,
  at: Date = new Date()
): { min: string; max: string } | null {
  const hours = getHoursForDate(dateStr);
  if (!hours) return null;

  const { firstSlot, lastSlot } = getOrderSlotBounds(hours, leadMinutes);
  let min = firstSlot;
  const max = lastSlot;
  const todayStr = todayInStockholmDateString(at);

  if (dateStr === todayStr) {
    min = maxClock(min, defaultScheduledClock(leadMinutes, at));
  }

  if (clockToMinutes(min) > clockToMinutes(max)) return null;
  return { min, max };
}

export function clampScheduledClock(
  dateStr: string,
  clockHm: string,
  leadMinutes = DEFAULT_ORDER_LEAD_MINUTES,
  at: Date = new Date()
): string {
  const range = getOrderableClockRange(dateStr, leadMinutes, at);
  if (!range) return clockHm.slice(0, 5);
  const clock = clockHm.slice(0, 5);
  if (clockToMinutes(clock) < clockToMinutes(range.min)) return range.min;
  if (clockToMinutes(clock) > clockToMinutes(range.max)) return range.max;
  return clock;
}

/** Next date/time slot that fits opening hours and lead time. */
export function findNextOrderableSlot(
  leadMinutes = DEFAULT_ORDER_LEAD_MINUTES,
  at: Date = new Date(),
  maxDaysAhead = 30
): { dateStr: string; clock: string } {
  const start = todayInStockholmDateString(at);
  const [sy, smo, sd] = start.split('-').map(Number);
  const cursor = new Date(sy, smo - 1, sd);

  for (let i = 0; i <= maxDaysAhead; i++) {
    const dateStr = dateToStockholmInputValue(cursor);
    const range = getOrderableClockRange(dateStr, leadMinutes, at);
    if (range) {
      return { dateStr, clock: range.min };
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const fallbackDate = dateToStockholmInputValue(at);
  const hours = getHoursForDate(fallbackDate);
  const slots = hours ? getOrderSlotBounds(hours, leadMinutes) : null;
  return { dateStr: fallbackDate, clock: slots?.firstSlot ?? '11:30' };
}

export function parseScheduledDateAndClock(
  scheduledTime: string
): { dateStr: string; clock: string } | null {
  const s = String(scheduledTime).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!m) return null;
  return { dateStr: m[1], clock: m[2] };
}

export function validateScheduledOrderTime(
  scheduledTime: string | null | undefined,
  leadMinutes = DEFAULT_ORDER_LEAD_MINUTES,
  at: Date = new Date()
): { valid: true } | { valid: false; error: string } {
  if (scheduledTime == null || String(scheduledTime).trim() === '') {
    const todayStr = todayInStockholmDateString(at);
    const range = getOrderableClockRange(todayStr, leadMinutes, at);
    if (!range) {
      return {
        valid: false,
        error: 'Vi har stängt just nu. Välj en tid under våra öppettider.',
      };
    }
    return { valid: true };
  }

  const parsed = parseScheduledDateAndClock(String(scheduledTime));
  if (!parsed) {
    return { valid: false, error: 'Ogiltig förbeställningstid. Välj datum och tid igen.' };
  }

  const hours = getHoursForDate(parsed.dateStr);
  if (!hours) {
    return {
      valid: false,
      error: 'Vi har stängt den valda dagen. Välj ett annat datum.',
    };
  }

  const range = getOrderableClockRange(parsed.dateStr, leadMinutes, at);
  if (!range) {
    return {
      valid: false,
      error: 'Inga tider kvar idag. Välj ett annat datum.',
    };
  }

  const clock = parsed.clock.slice(0, 5);
  if (clockToMinutes(clock) < clockToMinutes(range.min)) {
    return {
      valid: false,
      error: `Tiden är för tidig. Tidigast möjliga tid är kl. ${range.min}.`,
    };
  }
  if (clockToMinutes(clock) > clockToMinutes(range.max)) {
    return {
      valid: false,
      error: `Tiden är för sen. Senast möjliga upphämtning är kl. ${range.max}.`,
    };
  }

  return { valid: true };
}

/** Bump to the next valid slot when the current selection is stale or out of range. */
export function resolveValidScheduledSlot(
  dateStr: string,
  clock: string,
  leadMinutes = DEFAULT_ORDER_LEAD_MINUTES,
  at: Date = new Date()
): { dateStr: string; clock: string; wasAdjusted: boolean } {
  const scheduledTime = `${dateStr}T${clock.slice(0, 5)}:00`;
  const check = validateScheduledOrderTime(scheduledTime, leadMinutes, at);
  if (check.valid) {
    return {
      dateStr,
      clock: clampScheduledClock(dateStr, clock, leadMinutes, at),
      wasAdjusted: false,
    };
  }
  const slot = findNextOrderableSlot(leadMinutes, at);
  return { ...slot, wasAdjusted: true };
}

export function formatOpeningHoursLines(lang: OpeningHoursLanguage): string[] {
  const { open, close } = DEFAULT_DAY_HOURS;
  const labels: Record<OpeningHoursLanguage, string> = {
    sv: 'Mån–Sön',
    en: 'Mon–Sun',
    ar: 'الإثنين–الأحد',
  };
  return [`${labels[lang]}: ${open} - ${close}`];
}

export function formatOpeningHoursCompact(lang: OpeningHoursLanguage): string {
  return formatOpeningHoursLines(lang)[0];
}
