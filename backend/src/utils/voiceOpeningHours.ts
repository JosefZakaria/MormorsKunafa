/** Preparatory adapter, not connected to live routes.
 * Once dashboard hours exist, pass the central service's resolved hours for the
 * requested bakery/date. A failed lookup must never silently reuse the base schedule.
 */
export type VoiceBakery = 'hoja' | 'mollevangen';
export type VoiceDayHours = { open: string; close: string };

export type VoiceHoursSource =
  | { kind: 'owner_schedule' }
  | { kind: 'current_schedule'; location: VoiceBakery; date: string; hours: VoiceDayHours | null }
  | { kind: 'unavailable' };

export type VoiceHoursResult =
  | { source: 'owner_schedule' | 'current_schedule'; hours: VoiceDayHours | null; referToWebsite: false }
  | { source: 'unavailable'; hours: null; referToWebsite: true; website: string };

function weekday(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Ogiltigt datum.');
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('Ogiltigt datum.');
  }
  return parsed.getUTCDay();
}

function validHours(hours: VoiceDayHours | null): boolean {
  if (hours === null) return true; // Explicitly closed, distinct from a failed lookup.
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  return typeof hours === 'object' && clock.test(hours.open) && clock.test(hours.close)
    && hours.open < hours.close;
}

/** date is a Stockholm calendar date, not a UTC timestamp. */
export function resolveVoiceOpeningHours(
  location: VoiceBakery,
  date: string,
  source: VoiceHoursSource,
): VoiceHoursResult {
  if (location !== 'hoja' && location !== 'mollevangen') throw new Error('Ogiltig lokal.');
  const day = weekday(date);
  if (source.kind === 'owner_schedule') {
    return {
      source: 'owner_schedule',
      hours: location === 'hoja' && day === 1 ? null : { open: '11:00', close: '22:00' },
      referToWebsite: false,
    };
  }
  if (source.kind === 'current_schedule' && source.location === location && source.date === date
    && validHours(source.hours)) {
    return { source: 'current_schedule', hours: source.hours, referToWebsite: false };
  }
  return { source: 'unavailable', hours: null, referToWebsite: true, website: 'https://mormorskunafa.se' };
}
