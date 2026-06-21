/**
 * Parse customer "wall clock" times in Europe/Stockholm without extra dependencies.
 * Naive `YYYY-MM-DDTHH:mm:ss` (no Z / no offset) is interpreted as Stockholm local time.
 */

const NAIVE_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

const stockholmPartsFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function stockholmWallParts(utcMs: number): {
  y: number;
  mo: number;
  d: number;
  hh: number;
  mm: number;
  ss: number;
} {
  const parts = Object.fromEntries(
    stockholmPartsFormatter
      .formatToParts(new Date(utcMs))
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)])
  ) as Record<string, number>;
  return {
    y: parts.year,
    mo: parts.month,
    d: parts.day,
    hh: parts.hour,
    mm: parts.minute,
    ss: parts.second,
  };
}

function matchesStockholmWall(
  utcMs: number,
  y: number,
  mo: number,
  d: number,
  hh: number,
  mm: number,
  ss: number
): boolean {
  const p = stockholmWallParts(utcMs);
  return p.y === y && p.mo === mo && p.d === d && p.hh === hh && p.mm === mm && p.ss === ss;
}

/** Map YYYY-MM-DD + Stockholm wall clock to a UTC Date (minute resolution, then seconds if needed). */
function naiveStockholmDateTimeToUtc(isoLocal: string): Date | null {
  const m = isoLocal.match(NAIVE_LOCAL_RE);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  const ss = m[6] != null ? Number(m[6]) : 0;

  const start = Date.UTC(y, mo - 1, d, 0, 0, 0) - 2 * 24 * 60 * 60 * 1000;
  const end = Date.UTC(y, mo - 1, d, 0, 0, 0) + 2 * 24 * 60 * 60 * 1000;

  if (ss === 0) {
    for (let t = start; t <= end; t += 60 * 1000) {
      if (matchesStockholmWall(t, y, mo, d, hh, mm, 0)) return new Date(t);
    }
  }
  for (let t = start; t <= end; t += 1000) {
    if (matchesStockholmWall(t, y, mo, d, hh, mm, ss)) return new Date(t);
  }
  return null;
}

/**
 * `scheduledTime` from the client: ISO with Z/offset, or naive `YYYY-MM-DDTHH:mm:ss` (Stockholm wall).
 */
export function parseOrderScheduledAt(input: string | undefined | null): Date | null {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;

  if (/[zZ]|[+-]\d{2}:?\d{2}/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (NAIVE_LOCAL_RE.test(s)) {
    return naiveStockholmDateTimeToUtc(s);
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatStockholmDateTime(isoString: Date | string | null | undefined): string {
  if (isoString == null) return '';
  const d = isoString instanceof Date ? isoString : new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('sv-SE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Stockholm',
  });

  const parts = formatter.formatToParts(d);
  let weekday = '';
  let day = '';
  let month = '';
  let hour = '';
  let minute = '';
  for (const part of parts) {
    if (part.type === 'weekday') weekday = part.value;
    else if (part.type === 'day') day = part.value;
    else if (part.type === 'month') month = part.value;
    else if (part.type === 'hour') hour = part.value;
    else if (part.type === 'minute') minute = part.value;
  }

  if (!weekday || !day || !month || !hour || !minute) {
    return formatter.format(d);
  }

  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${capitalizedWeekday} ${day} ${month} kl. ${hour}:${minute}`;
}
