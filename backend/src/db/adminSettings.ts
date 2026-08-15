import type { Row } from './connection.js';

export type AdminSettingsDto = {
  defaultPreparationTime: number;
  isPaused: boolean;
  eatHereEnabled: boolean;
  takeawayEnabled: boolean;
  deliveryEnabled: boolean;
};

export const ADMIN_SETTINGS_PUBLIC_SELECT =
  'default_preparation_time_minutes, is_paused, eat_here_enabled, takeaway_enabled, delivery_enabled';

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

export function rowToAdminSettings(r: Row): AdminSettingsDto {
  return {
    defaultPreparationTime: Number(r.default_preparation_time_minutes) || 30,
    isPaused: Boolean(r.is_paused),
    eatHereEnabled: flagEnabled(r.eat_here_enabled),
    takeawayEnabled: flagEnabled(r.takeaway_enabled),
    deliveryEnabled: flagEnabled(r.delivery_enabled),
  };
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
}

/** Returns a 403 message if this order type is disabled; otherwise null. */
export function disabledOrderTypeError(orderType: string, settings: Row): string | null {
  const column = ORDER_TYPE_ENABLED_COLUMN[orderType];
  if (!column) return null;
  if (flagEnabled(settings[column])) return null;
  const label = ORDER_TYPE_LABEL_SV[orderType] ?? 'Det valda leveranssättet';
  return `${label} är för tillfället pausat. Försök igen senare.`;
}
