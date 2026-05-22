const UUID_PREFIX =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/**
 * Cart lines use composite ids (e.g. "{uuid}-1 st" for bread variants).
 * Supabase product_id must be the base product UUID or null.
 */
export function resolveProductIdFromLineId(lineProductId: string | undefined): string | null {
  const raw = String(lineProductId ?? '').trim();
  if (!raw) return null;
  const match = raw.match(UUID_PREFIX);
  return match ? match[1].toLowerCase() : null;
}
