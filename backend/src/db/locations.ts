import type { Location, LocationSlug } from '@mormors-kunafa/shared/types';
import { supabase, type Row, logSupabaseError } from './connection.js';

/** Must match `HOJA_LOCATION_ID` in shared/types and the SQL seed. */
const HOJA_LOCATION_ID = '2f1a9c4e-6b7d-4e8f-a901-b2c3d4e5f601';

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
 * Eat-here / takeaway use the requested id, or Höja when the client omits it.
 */
export async function resolveOrderLocationId(
  orderType: string,
  requestedId: string | undefined | null
): Promise<{ locationId: string | null; error?: string }> {
  if (orderType === 'delivery') {
    return { locationId: null };
  }

  const trimmed = String(requestedId ?? '').trim();
  if (trimmed) {
    const location = await getLocationById(trimmed);
    if (!location) {
      return { locationId: null, error: 'Ogiltig plats.' };
    }
    return { locationId: location.id };
  }

  const hoja =
    (await getLocationById(HOJA_LOCATION_ID)) ?? (await getLocationBySlug('hoja'));
  if (!hoja) {
    return { locationId: null, error: 'Kunde inte hitta standardplatsen Höja.' };
  }
  return { locationId: hoja.id };
}
