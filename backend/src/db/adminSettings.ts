import type { Location } from '@mormors-kunafa/shared/types';
import type { Row } from './connection.js';
import { listLocations } from './locations.js';

const DEFAULT_HERO_DESKTOP = '/images/kunafa-ashta.jpg';
const DEFAULT_HERO_MOBILE = '/images/ny-kunafa-bild.jpg';

export type AdminSettingsDto = {
  defaultPreparationTime: number;
  isPaused: boolean;
  eatHereEnabled: boolean;
  takeawayEnabled: boolean;
  deliveryEnabled: boolean;
  locations: Location[];
  heroImageDesktop: string;
  heroImageMobile: string;
};

export const ADMIN_SETTINGS_PUBLIC_SELECT =
  'default_preparation_time_minutes, is_paused, eat_here_enabled, takeaway_enabled, delivery_enabled, hero_image_desktop_url, hero_image_mobile_url';

const ORDER_TYPE_ENABLED_COLUMN: Record<string, string> = {
  'eat-here': 'eat_here_enabled',
  takeaway: 'takeaway_enabled',
  delivery: 'delivery_enabled',
};

const ORDER_TYPE_LABEL_SV: Record<string, string> = {
  'eat-here': 'Äta här',
  takeaway: 'Ta med',
  delivery: 'Hemleverans',
};

function flagEnabled(value: unknown): boolean {
  return value !== false;
}

function heroUrl(value: unknown, fallback: string): string {
  const trimmed = String(value ?? '').trim();
  return trimmed || fallback;
}

export function rowToAdminSettings(r: Row, locations: Location[] = []): AdminSettingsDto {
  const eatHereEnabled =
    locations.length > 0
      ? locations.some((location) => !location.isPaused && location.eatHereEnabled)
      : flagEnabled(r.eat_here_enabled);
  const takeawayEnabled =
    locations.length > 0
      ? locations.some((location) => !location.isPaused && location.takeawayEnabled)
      : flagEnabled(r.takeaway_enabled);

  return {
    defaultPreparationTime: Number(r.default_preparation_time_minutes) || 30,
    isPaused: Boolean(r.is_paused),
    eatHereEnabled,
    takeawayEnabled,
    deliveryEnabled: flagEnabled(r.delivery_enabled),
    locations,
    heroImageDesktop: heroUrl(r.hero_image_desktop_url, DEFAULT_HERO_DESKTOP),
    heroImageMobile: heroUrl(r.hero_image_mobile_url, DEFAULT_HERO_MOBILE),
  };
}

export async function adminSettingsFromRow(r: Row): Promise<AdminSettingsDto> {
  const locations = await listLocations();
  return rowToAdminSettings(r, locations);
}

export function applyAdminSettingsPatch(
  body: Record<string, unknown>,
  patch: Record<string, unknown>
): void {
  if (typeof body.defaultPreparationTime === 'number') {
    patch.default_preparation_time_minutes = body.defaultPreparationTime;
  }
  if (typeof body.isPaused === 'boolean') {
    patch.is_paused = body.isPaused;
  }
  if (typeof body.eatHereEnabled === 'boolean') {
    patch.eat_here_enabled = body.eatHereEnabled;
  }
  if (typeof body.takeawayEnabled === 'boolean') {
    patch.takeaway_enabled = body.takeawayEnabled;
  }
  if (typeof body.deliveryEnabled === 'boolean') {
    patch.delivery_enabled = body.deliveryEnabled;
  }
  if (typeof body.heroImageDesktop === 'string') {
    patch.hero_image_desktop_url = body.heroImageDesktop.trim() || DEFAULT_HERO_DESKTOP;
  }
  if (typeof body.heroImageMobile === 'string') {
    patch.hero_image_mobile_url = body.heroImageMobile.trim() || DEFAULT_HERO_MOBILE;
  }
}

/** Returns a 403 message if this order type is disabled; otherwise null. */
export function disabledOrderTypeError(orderType: string, settings: Row): string | null {
  const column = ORDER_TYPE_ENABLED_COLUMN[orderType];
  if (!column) return null;
  if (flagEnabled(settings[column])) return null;
  const label = ORDER_TYPE_LABEL_SV[orderType] ?? 'Det valda leveranssättet';
  return `${label} är för tillfället pausat. Försök igen senare.`;
}
