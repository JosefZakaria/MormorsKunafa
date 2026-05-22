/** Normalize DB/Supabase timestamps to ISO-8601 UTC (with Z). */
export function dbTimestampToIso(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value.toISOString();

  const s = String(value).trim();
  if (!s) return undefined;

  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? s : d.toISOString();
  }

  const normalized = s.includes('T') ? s : s.replace(' ', 'T');
  const asUtc = new Date(`${normalized}Z`);
  if (!Number.isNaN(asUtc.getTime())) return asUtc.toISOString();

  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? s : fallback.toISOString();
}
