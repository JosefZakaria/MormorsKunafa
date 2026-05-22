/**
 * Parse timestamps from the API for countdowns/comparisons.
 * Supabase/Postgres often returns timestamptz without a Z suffix; those values are UTC.
 */
export function parseApiTimestamp(input: string | undefined | null): Date | null {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;

  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const normalized = s.includes('T') ? s : s.replace(' ', 'T');
  const asUtc = new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
  if (!Number.isNaN(asUtc.getTime())) return asUtc;

  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function parseApiTimestampToIso(input: string | undefined | null): string | undefined {
  const d = parseApiTimestamp(input);
  return d ? d.toISOString() : undefined;
}
