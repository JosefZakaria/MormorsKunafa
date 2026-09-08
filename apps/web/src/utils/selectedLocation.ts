import { HOJA_LOCATION_ID } from '@shared/types';

const LOCATION_ID_KEY = 'locationId';
const LOCATION_SLUG_KEY = 'locationSlug';

export function needsPickupLocation(orderType: string | null | undefined): boolean {
  return orderType === 'eat-here' || orderType === 'takeaway';
}

export function getStoredLocationId(): string {
  return sessionStorage.getItem(LOCATION_ID_KEY)?.trim() ?? '';
}

export function getStoredLocationSlug(): string {
  return sessionStorage.getItem(LOCATION_SLUG_KEY)?.trim() ?? '';
}

export function setStoredLocation(id: string, slug: string): void {
  sessionStorage.setItem(LOCATION_ID_KEY, id);
  sessionStorage.setItem(LOCATION_SLUG_KEY, slug);
}

export function clearStoredLocation(): void {
  sessionStorage.removeItem(LOCATION_ID_KEY);
  sessionStorage.removeItem(LOCATION_SLUG_KEY);
}

/** Location whose stock applies to the current customer order. Delivery uses Höja. */
export function stockLocationIdForCustomer(): string {
  const orderType = sessionStorage.getItem('orderType');
  if (orderType === 'delivery') return HOJA_LOCATION_ID;
  return getStoredLocationId();
}
