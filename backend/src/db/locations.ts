import type { Location, LocationSlug } from '@mormors-kunafa/shared/types';
import { supabase, type Row, logSupabaseError } from './connection.js';

export const LOCATION_COLUMNS =
  'id, slug, name, address, fulfills_delivery, eat_here_enabled, takeaway_enabled, is_paused';

function toLocationSlug(value: unknown): LocationSlug {
  return value === 'mollevangen' ? 'mollevangen' : 'hoja';
}

export function rowToLocation(r: Row): Location {
  return {
    id: String(r.id),
    slug: toLocationSlug(r.slug),
    name: String(r.name ?? ''),
    address: String(r.address ?? ''),
    fulfillsDelivery: r.fulfills_delivery === true,
    eatHereEnabled: r.eat_here_enabled !== false,
    takeawayEnabled: r.takeaway_enabled !== false,
    isPaused: r.is_paused === true,
  };
}

export async function listLocations(): Promise<Location[]> {
  const { data, error } = await supabase
    .from('locations')
    .select(LOCATION_COLUMNS)
    .order('slug', { ascending: true });

  if (error) {
    logSupabaseError('listLocations', error);
    throw error;
  }

  return (data ?? []).map((row) => rowToLocation(row as Row));
}

export async function getLocationById(id: string): Promise<Location | null> {
  const { data, error } = await supabase
    .from('locations')
    .select(LOCATION_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    logSupabaseError('getLocationById', error);
    throw error;
  }

  return data ? rowToLocation(data as Row) : null;
}

export async function getLocationBySlug(slug: string): Promise<Location | null> {
  const { data, error } = await supabase
    .from('locations')
    .select(LOCATION_COLUMNS)
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    logSupabaseError('getLocationBySlug', error);
    throw error;
  }

  return data ? rowToLocation(data as Row) : null;
}

/**
 * Delivery has no pickup location.
 * Eat-here / takeaway require a valid location id.
 */
export async function resolveOrderLocationId(
  orderType: string,
  requestedId: string | undefined | null
): Promise<{ locationId: string | null; location: Location | null; error?: string }> {
  if (orderType === 'delivery') {
    return { locationId: null, location: null };
  }

  const trimmed = String(requestedId ?? '').trim();
  if (!trimmed) {
    return { locationId: null, location: null, error: 'Välj plats för Äta här och Ta med.' };
  }

  const location = await getLocationById(trimmed);
  if (!location) {
    return { locationId: null, location: null, error: 'Ogiltig plats.' };
  }
  return { locationId: location.id, location };
}

export function locationOrderTypeError(orderType: string, location: Location): string | null {
  if (location.isPaused) {
    return `Beställningar till ${location.name} är för tillfället pausade, försök igen senare.`;
  }
  if (orderType === 'eat-here' && !location.eatHereEnabled) {
    return `Äta här är för tillfället pausat på ${location.name}. Försök igen senare.`;
  }
  if (orderType === 'takeaway' && !location.takeawayEnabled) {
    return `Ta med är för tillfället pausat på ${location.name}. Försök igen senare.`;
  }
  return null;
}

export type LocationFlagsPatch = {
  isPaused?: boolean;
  eatHereEnabled?: boolean;
  takeawayEnabled?: boolean;
};

export async function updateLocationFlags(
  id: string,
  patch: LocationFlagsPatch
): Promise<Location | null> {
  const dbPatch: Record<string, unknown> = {};
  if (typeof patch.isPaused === 'boolean') dbPatch.is_paused = patch.isPaused;
  if (typeof patch.eatHereEnabled === 'boolean') dbPatch.eat_here_enabled = patch.eatHereEnabled;
  if (typeof patch.takeawayEnabled === 'boolean') dbPatch.takeaway_enabled = patch.takeawayEnabled;

  if (Object.keys(dbPatch).length === 0) {
    return getLocationById(id);
  }

  const { data, error } = await supabase
    .from('locations')
    .update(dbPatch)
    .eq('id', id)
    .select(LOCATION_COLUMNS)
    .maybeSingle();

  if (error) {
    logSupabaseError('updateLocationFlags', error);
    throw error;
  }

  return data ? rowToLocation(data as Row) : null;
}

export function pickupPlaceLabel(location: Location | null | undefined): string | null {
  if (!location) return null;
  const address = location.address.trim();
  return address ? `${location.name}, ${address}` : location.name;
}

export async function inStorePickupSmsSuffix(order: Row): Promise<string> {
  if (String(order.order_type ?? '') === 'delivery') return '';
  const id = order.location_id != null ? String(order.location_id) : '';
  if (!id) return '';
  const location = await getLocationById(id);
  const label = pickupPlaceLabel(location);
  return label ? ` Plats: ${label}.` : '';
}
