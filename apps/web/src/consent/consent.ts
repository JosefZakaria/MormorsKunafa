/**
 * Cookie/storage consent for the public site.
 *
 * Rule: nothing is read from or written to the visitor's browser storage until the
 * visitor has made a choice in the consent banner. Until then, all values live in
 * memory only and disappear on reload.
 *
 * Categories:
 *  - necessary: the consent choice itself plus tab-only data the order flow needs
 *    (order type, pickup place, cart). Stored in sessionStorage after a choice.
 *  - preferences: remember language and cart across visits (localStorage).
 *  - externalMedia: embedded Google Maps, which lets Google set its own cookies.
 *
 * Admin pages (staff login, printer and alarm settings) are not covered: staff
 * storage is strictly necessary for the service they actively log in to.
 */

export const CONSENT_STORAGE_KEY = 'mk-consent';
export const CONSENT_VERSION = 1;
/** Ask again after 12 months. */
const CONSENT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export interface ConsentChoices {
  preferences: boolean;
  externalMedia: boolean;
}

export interface ConsentState extends ConsentChoices {
  version: number;
  decidedAt: string;
}

type Area = 'local' | 'session';
type Category = 'necessary' | 'preferences';

interface KeyRule {
  category: Category;
  /** For preference keys: keep the value for this tab when preferences are declined. */
  sessionFallback?: boolean;
}

/** Every customer-facing storage key must be listed here. */
const KEY_RULES: Record<string, KeyRule> = {
  orderType: { category: 'necessary' },
  locationId: { category: 'necessary' },
  locationSlug: { category: 'necessary' },
  swishPayerPhone: { category: 'necessary' },
  language: { category: 'preferences', sessionFallback: true },
  'mormors-kunafa-cart': { category: 'preferences', sessionFallback: true },
};

/** Keys older versions of the site stored that are no longer used. */
const LEGACY_KEYS = ['deliveryInfo'];

const memory = new Map<string, string>();
const listeners = new Set<() => void>();
let current: ConsentState | null = loadConsent();
let settingsOpen = false;

/**
 * Read the stored choice. Without a valid one (never chosen, expired, or data left by
 * older versions of the site), delete every customer value so nothing lingers.
 */
function loadConsent(): ConsentState | null {
  const state = readStoredConsent();
  if (state) return state;
  try {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    for (const key of [...Object.keys(KEY_RULES), ...LEGACY_KEYS]) {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    }
  } catch {
    /* Storage blocked: nothing to clean. */
  }
  return null;
}

function safeStorage(area: Area): Storage | null {
  try {
    return area === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function readStoredConsent(): ConsentState | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    const decidedAt = Date.parse(String(parsed.decidedAt));
    if (parsed.version !== CONSENT_VERSION || !Number.isFinite(decidedAt)) return null;
    if (Date.now() - decidedAt > CONSENT_MAX_AGE_MS) return null;
    return {
      version: CONSENT_VERSION,
      decidedAt: new Date(decidedAt).toISOString(),
      preferences: parsed.preferences === true,
      externalMedia: parsed.externalMedia === true,
    };
  } catch {
    return null;
  }
}

/** Where a key should live under a given consent state. `null` = memory only. */
function targetArea(key: string, state: ConsentState | null): Area | null {
  if (!state) return null;
  const rule = KEY_RULES[key];
  if (!rule || rule.category === 'necessary') return 'session';
  if (state.preferences) return 'local';
  return rule.sessionFallback ? 'session' : null;
}

function emit() {
  for (const listener of listeners) listener();
}

/** Move every registered value to where the new consent state allows it, and delete it everywhere else. */
function migrate(previous: ConsentState | null, next: ConsentState) {
  for (const key of Object.keys(KEY_RULES)) {
    const from = targetArea(key, previous);
    const value = from ? safeStorage(from)?.getItem(key) ?? null : memory.get(key) ?? null;
    memory.delete(key);
    // Remove from both storages, including stale values from before the banner existed.
    safeStorage('local')?.removeItem(key);
    safeStorage('session')?.removeItem(key);
    if (value === null) continue;
    const to = targetArea(key, next);
    if (to) safeStorage(to)?.setItem(key, value);
    else memory.set(key, value);
  }
  for (const key of LEGACY_KEYS) safeStorage('local')?.removeItem(key);
}

export function getConsent(): ConsentState | null {
  return current;
}

export function hasDecided(): boolean {
  return current !== null;
}

export function saveConsent(choices: ConsentChoices): void {
  const next: ConsentState = {
    version: CONSENT_VERSION,
    decidedAt: new Date().toISOString(),
    preferences: choices.preferences,
    externalMedia: choices.externalMedia,
  };
  const previous = current;
  migrate(previous, next);
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* Storage blocked: the choice still applies for this page view. */
  }
  current = next;
  settingsOpen = false;
  emit();
}

export function acceptAll(): void {
  saveConsent({ preferences: true, externalMedia: true });
}

export function acceptNecessaryOnly(): void {
  saveConsent({ preferences: false, externalMedia: false });
}

export function isSettingsOpen(): boolean {
  return settingsOpen;
}

export function openConsentSettings(): void {
  settingsOpen = true;
  emit();
}

export function closeConsentSettings(): void {
  settingsOpen = false;
  emit();
}

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Consent-aware replacement for localStorage/sessionStorage on customer pages. */
export const consentStorage = {
  getItem(key: string): string | null {
    const area = targetArea(key, current);
    if (!area) return memory.get(key) ?? null;
    try {
      return safeStorage(area)?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    const area = targetArea(key, current);
    if (!area) {
      memory.set(key, value);
      return;
    }
    try {
      safeStorage(area)?.setItem(key, value);
    } catch {
      memory.set(key, value);
    }
  },
  removeItem(key: string): void {
    memory.delete(key);
    const area = targetArea(key, current);
    if (!area) return;
    try {
      safeStorage(area)?.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
