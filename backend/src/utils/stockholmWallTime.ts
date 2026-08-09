import { DateTime } from 'luxon';

const STOCKHOLM_ZONE = 'Europe/Stockholm';
const NAIVE_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;
const OFFSET_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Parse only explicit ISO timestamps. Naive values are Stockholm wall time;
 * impossible dates and DST-gap wall times are rejected instead of normalized.
 */
export function parseOrderScheduledAt(input: string | undefined | null): Date | null {
  if (input == null) return null;
  const value = String(input).trim();
  if (!value) return null;

  if (OFFSET_ISO_RE.test(value)) {
    const parsed = DateTime.fromISO(value, { setZone: true });
    return parsed.isValid ? parsed.toUTC().toJSDate() : null;
  }
  if (!NAIVE_LOCAL_RE.test(value)) return null;

  const normalizedInput = value.length === 16 ? `${value}:00` : value;
  const parsed = DateTime.fromFormat(normalizedInput, "yyyy-MM-dd'T'HH:mm:ss", {
    zone: STOCKHOLM_ZONE,
    setZone: true,
    locale: 'sv-SE',
  });
  if (!parsed.isValid) return null;

  // Luxon normalizes nonexistent local times during the spring DST jump. A
  // strict round-trip rejects those values as invalid customer input.
  if (parsed.toFormat("yyyy-MM-dd'T'HH:mm:ss") !== normalizedInput) return null;
  return parsed.toUTC().toJSDate();
}

export function formatStockholmDateTime(isoString: Date | string | null | undefined): string {
  if (isoString == null) return '';
  const parsed = isoString instanceof Date
    ? DateTime.fromJSDate(isoString)
    : DateTime.fromISO(String(isoString), { setZone: true });
  if (!parsed.isValid) return '';

  const stockholm = parsed.setZone(STOCKHOLM_ZONE).setLocale('sv-SE');
  const weekday = stockholm.toFormat('cccc');
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${capitalizedWeekday} ${stockholm.toFormat("d LLLL 'kl.' HH:mm")}`;
}
