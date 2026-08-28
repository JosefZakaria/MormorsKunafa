import type { AdminRole } from '@mormors-kunafa/shared/types';
import { supabase, type Row, logSupabaseError } from '../db/connection.js';
import { getLocationById } from '../db/locations.js';

export type AdminScope = {
  adminId: string;
  role: AdminRole;
  locationId: string | null;
  fulfillsDelivery: boolean;
};

export type OrderLocationRef = {
  orderType?: string | null;
  locationId?: string | null;
};

export function parseAdminRole(value: unknown): AdminRole {
  return value === 'location' ? 'location' : 'owner';
}

export function orderVisibleToScope(scope: AdminScope, order: OrderLocationRef): boolean {
  if (scope.role !== 'location') return true;
  if (!scope.locationId) return false;
  if (String(order.orderType ?? '') === 'delivery') return scope.fulfillsDelivery;
  return String(order.locationId ?? '') === scope.locationId;
}

export function orderRowVisibleToScope(scope: AdminScope, row: Row): boolean {
  return orderVisibleToScope(scope, {
    orderType: row.order_type != null ? String(row.order_type) : null,
    locationId: row.location_id != null ? String(row.location_id) : null,
  });
}

export async function loadAdminScope(adminId: string): Promise<AdminScope> {
  const { data, error } = await supabase
    .from('admin_users')
    .select('id, role, location_id')
    .eq('id', adminId)
    .maybeSingle();

  if (error) {
    logSupabaseError('loadAdminScope', error);
    throw error;
  }

  if (!data) {
    return { adminId, role: 'owner', locationId: null, fulfillsDelivery: false };
  }

  const role = parseAdminRole((data as Row).role);
  const locationId =
    (data as Row).location_id != null ? String((data as Row).location_id) : null;
  let fulfillsDelivery = false;
  if (role === 'location' && locationId) {
    const location = await getLocationById(locationId);
    fulfillsDelivery = location?.fulfillsDelivery === true;
  }

  return { adminId, role, locationId, fulfillsDelivery };
}

export async function loadAdminScopes(adminIds: string[]): Promise<Map<string, AdminScope>> {
  const unique = [...new Set(adminIds.filter(Boolean))];
  const scopes = new Map<string, AdminScope>();
  await Promise.all(
    unique.map(async (id) => {
      scopes.set(id, await loadAdminScope(id));
    })
  );
  return scopes;
}
