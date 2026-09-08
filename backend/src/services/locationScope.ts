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

export function parseAdminRole(value: unknown): AdminRole | null {
  return value === 'location' || value === 'owner' ? value : null;
}

export function orderVisibleToScope(scope: AdminScope, order: OrderLocationRef): boolean {
  if (scope.role === 'owner') return true;
  if (scope.role !== 'location') return false;
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

export async function loadAdminScope(adminId: string, expectedTokenVersion?: number): Promise<AdminScope> {
  const { data, error } = await supabase
    .from('admin_users')
    .select('id, role, location_id, is_active, token_version')
    .eq('id', adminId)
    .maybeSingle();

  if (error) {
    logSupabaseError('loadAdminScope', error);
    throw error;
  }

  if (!data || data.is_active !== true || (expectedTokenVersion !== undefined && Number(data.token_version) !== expectedTokenVersion)) {
    throw new Error('Admin account is no longer active');
  }

  const role = parseAdminRole((data as Row).role);
  if (!role) throw new Error('Unknown admin role');
  const locationId =
    (data as Row).location_id != null ? String((data as Row).location_id) : null;
  let fulfillsDelivery = false;
  if (role === 'location' && !locationId) throw new Error('Admin location is missing');
  if (role === 'location' && locationId) {
    const location = await getLocationById(locationId);
    if (!location) throw new Error('Admin location is no longer valid');
    fulfillsDelivery = location?.fulfillsDelivery === true;
  }

  return { adminId, role, locationId, fulfillsDelivery };
}

export async function loadAdminScopes(adminIds: string[]): Promise<Map<string, AdminScope>> {
  const unique = [...new Set(adminIds.filter(Boolean))];
  const scopes = new Map<string, AdminScope>();
  await Promise.allSettled(
    unique.map(async (id) => {
      scopes.set(id, await loadAdminScope(id));
    })
  );
  return scopes;
}
