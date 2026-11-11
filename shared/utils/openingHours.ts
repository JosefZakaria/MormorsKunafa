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
  roundClockToNext5Min,
  todayInStockholmDateString,
} from './scheduledTime.js';
import type { LocationSlug, OpeningDayHours, OpeningHoursSchedule } from '../types/index.js';

export const STOCKHOLM_TZ = 'Europe/Stockholm';

export type DayHours = OpeningDayHours;

export function defaultOpeningHours(slug?: LocationSlug): OpeningHoursSchedule {
  return {
    weekly: Object.fromEntries(Array.from({ length: 7 }, (_, day) => [
      day, slug === 'hoja' && day === 1 ? null : { open: '11:00', close: '22:00' },
    ])),
    exceptions: {},
  };
}

export function isOpeningDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Reject malformed saved schedules rather than silently substituting old hours. */
export function parseOpeningHours(value: unknown): OpeningHoursSchedule {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Ange ett giltigt öppettidsschema.');
  }
  const { weekly, exceptions } = value as Record<string, unknown>;
  if (!weekly || typeof weekly !== 'object' || Array.isArray(weekly) ||
      Object.keys(weekly).length !== 7 || !Object.keys(weekly).every(day => /^[0-6]$/.test(day))) {
    throw new Error('Ange öppettider eller stängt för alla sju veckodagar.');
  }
  if (!exceptions || typeof exceptions !== 'object' || Array.isArray(exceptions)) {
    throw new Error('Ange giltiga datumundantag.');
  }
  const readDay = (day: unknown): DayHours | null => {
    if (day === null) return null;
    if (!day || typeof day !== 'object' || Array.isArray(day)) throw new Error('Ange giltiga klockslag.');
    const { open, close } = day as Record<string, unknown>;
    const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (typeof open !== 'string' || typeof close !== 'string' ||
        !clock.test(open) || !clock.test(close) || open >= close) {
      throw new Error('Stängningstiden måste vara senare än öppningstiden samma dag.');
    }
    return { open, close };
  };
  return {
    weekly: Object.fromEntries(Object.entries(weekly).map(([day, hours]) => [day, readDay(hours)])),
    exceptions: Object.fromEntries(Object.entries(exceptions).map(([date, hours]) => {
      if (!isOpeningDate(date)) throw new Error('Ange ett giltigt datum för undantaget.');
      return [date, readDay(hours)];
    })),
  };
}

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

export function getHoursForDate(dateStr: string, schedule?: OpeningHoursSchedule): DayHours | null {
  if (!isOpeningDate(dateStr)) return null;
  if (schedule && Object.prototype.hasOwnProperty.call(schedule.exceptions, dateStr)) return schedule.exceptions[dateStr];
  return (schedule?.weekly ?? OPENING_HOURS_BY_WEEKDAY)[weekdayInStockholm(dateStr)] ?? null;
}

export function isStoreClosedNow(at: Date = new Date(), schedule?: OpeningHoursSchedule): boolean {
  const dateStr = dateToStockholmInputValue(at);
  const hours = getHoursForDate(dateStr, schedule);
  if (!hours) return true;

  const nowHm = at.toLocaleTimeString('sv-SE', {
    timeZone: STOCKHOLM_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const nowMin = clockToMinutes(nowHm);
  const openMin = clockToMinutes(hours.open);
  const closeMin = clockToMinutes(hours.close);

  return nowMin < openMin || nowMin >= closeMin;
}


/** Selectable clock range for a given date, or null when no slots remain. */
export function getOrderableClockRange(
  dateStr: string,
  leadMinutes = DEFAULT_ORDER_LEAD_MINUTES,
  at: Date = new Date(),
  schedule?: OpeningHoursSchedule
): { min: string; max: string } | null {
  if (dateStr < todayInStockholmDateString(at)) return null;
  const hours = getHoursForDate(dateStr, schedule);
  if (!hours) return null;

  const { firstSlot, lastSlot } = getOrderSlotBounds(hours, leadMinutes);
  let min = firstSlot;
  const max = lastSlot;
  const todayStr = todayInStockholmDateString(at);

  if (dateStr === todayStr) {
    if (todayInStockholmDateString(new Date(at.getTime() + leadMinutes * 60_000)) !== todayStr) return null;
    min = maxClock(min, defaultScheduledClock(leadMinutes, at));
  }
  if (clockToMinutes(min) > clockToMinutes(max)) return null;
  min = roundClockToNext5Min(min);

  if (clockToMinutes(min) > clockToMinutes(max)) return null;
  return { min, max };
}

export function clampScheduledClock(
  dateStr: string,
  clockHm: string,
  leadMinutes = DEFAULT_ORDER_LEAD_MINUTES,
  at: Date = new Date(),
  schedule?: OpeningHoursSchedule
): string {
  const range = getOrderableClockRange(dateStr, leadMinutes, at, schedule);
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
  maxDaysAhead = 30,
  schedule?: OpeningHoursSchedule
): { dateStr: string; clock: string } {
  const start = todayInStockholmDateString(at);
  const [sy, smo, sd] = start.split('-').map(Number);
  const cursor = new Date(Date.UTC(sy, smo - 1, sd, 12));

  for (let i = 0; i <= maxDaysAhead; i++) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const range = getOrderableClockRange(dateStr, leadMinutes, at, schedule);
    if (range) {
      return { dateStr, clock: range.min };
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { dateStr: '', clock: '' };
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
  at: Date = new Date(),
  schedule?: OpeningHoursSchedule
): { valid: true } | { valid: false; error: string } {
  if (scheduledTime == null || String(scheduledTime).trim() === '') {
    if (isStoreClosedNow(at, schedule)) {
      return {
        valid: false,
        error: 'Vi har stängt just nu. Välj en tid under våra öppettider.',
      };
    }
    const todayStr = todayInStockholmDateString(at);
    const range = getOrderableClockRange(todayStr, leadMinutes, at, schedule);
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

  const hours = getHoursForDate(parsed.dateStr, schedule);
  if (!hours) {
    return {
      valid: false,
      error: 'Vi har stängt den valda dagen. Välj ett annat datum.',
    };
  }

  const range = getOrderableClockRange(parsed.dateStr, leadMinutes, at, schedule);
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
