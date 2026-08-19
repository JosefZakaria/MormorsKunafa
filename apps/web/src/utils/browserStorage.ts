export const STORAGE_POLICY_VERSION = 1;

export const STORAGE_KEYS = {
  cart: 'mormors-kunafa-cart',
  language: 'language',
  printerIp: 'printer_ip',
  printerDeviceId: 'printer_devid',
  adminAlarmVolume: 'admin_alarm_volume',
} as const;

export const STORAGE_TTL_MS = {
  cart: 30 * 24 * 60 * 60 * 1000,
  preference: 365 * 24 * 60 * 60 * 1000,
} as const;

type StoredEnvelope<T> = {
  version: number;
  expiresAt: number;
  value: T;
};

function isEnvelope(value: unknown): value is StoredEnvelope<unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<StoredEnvelope<unknown>>;
  return candidate.version === STORAGE_POLICY_VERSION
    && Number.isSafeInteger(candidate.expiresAt)
    && (candidate.expiresAt ?? 0) > 0
    && 'value' in candidate;
}

export function writePersistentValue<T>(key: string, value: T, ttlMs: number): void {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new Error('Storage TTL must be positive');
  const envelope: StoredEnvelope<T> = {
    version: STORAGE_POLICY_VERSION,
    expiresAt: Date.now() + ttlMs,
    value,
  };
  localStorage.setItem(key, JSON.stringify(envelope));
}

export function removePersistentValue(key: string): void {
  localStorage.removeItem(key);
}

export function readPersistentValue<T>(
  key: string,
  isValue: (value: unknown) => value is T,
  ttlMs: number,
  parseLegacy?: (raw: string) => T | null
): T | null {
  const raw = localStorage.getItem(key);
  if (raw == null) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isEnvelope(parsed)) {
      if (parsed.expiresAt <= Date.now() || !isValue(parsed.value)) {
        removePersistentValue(key);
        return null;
      }
      return parsed.value;
    }
  } catch {
    // A pre-policy string value can still be migrated by the bounded parser.
  }

  const legacyValue = parseLegacy?.(raw) ?? null;
  if (!isValue(legacyValue)) {
    removePersistentValue(key);
    return null;
  }
  writePersistentValue(key, legacyValue, ttlMs);
  return legacyValue;
}
