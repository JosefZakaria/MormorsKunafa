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
