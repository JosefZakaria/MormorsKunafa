import { generateId, logSupabaseError, nowIso, supabase, type Row } from './connection.js';

export type PushSubscriptionRow = {
  id: string;
  admin_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  device_label: string | null;
  created_at: string;
  updated_at: string;
  disabled_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_failure_reason: string | null;
};

export type PushDeliveryLogRow = {
  id: string;
  event_id: string;
  subscription_id: string;
  status: 'success' | 'failed';
  status_code: number | null;
  error_message: string | null;
  created_at: string;
};

export async function listActivePushSubscriptions(adminId?: string): Promise<PushSubscriptionRow[]> {
  let query = supabase
    .from('admin_push_subscriptions')
    .select('*')
    .is('disabled_at', null)
    .order('created_at', { ascending: false });

  if (adminId) {
    query = query.eq('admin_id', adminId);
  }

  const { data, error } = await query;
  if (error) {
    logSupabaseError('listActivePushSubscriptions', error);
    return [];
  }
  return ((data ?? []) as Row[]).map((row) => row as unknown as PushSubscriptionRow);
}

export async function upsertPushSubscription(args: {
  adminId: string;
  adminTokenVersion: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
  deviceLabel?: string;
}): Promise<PushSubscriptionRow | null> {
  const { data, error } = await supabase.rpc('register_admin_push_subscription', {
    p_admin_id: args.adminId,
    p_admin_token_version: args.adminTokenVersion,
    p_endpoint: args.endpoint,
    p_p256dh: args.p256dh,
    p_auth: args.auth,
    p_user_agent: args.userAgent?.trim() || null,
    p_device_label: args.deviceLabel?.trim() || null,
  });

  if (error) {
    logSupabaseError('upsertPushSubscription', error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : null;
  return row ? (row as unknown as PushSubscriptionRow) : null;
}

export async function disablePushSubscriptionById(subscriptionId: string, adminId: string): Promise<boolean> {
  const { error } = await supabase
    .from('admin_push_subscriptions')
    .update({ disabled_at: nowIso(), updated_at: nowIso() })
    .eq('id', subscriptionId)
    .eq('admin_id', adminId);

  if (error) {
    logSupabaseError('disablePushSubscriptionById', error);
    return false;
  }
  return true;
}

export async function isPushSubscriptionCurrent(subscription: PushSubscriptionRow): Promise<boolean> {
  const { data, error } = await supabase
    .from('admin_push_subscriptions')
    .select('id')
    .eq('id', subscription.id)
    .eq('admin_id', subscription.admin_id)
    .eq('endpoint', subscription.endpoint)
    .eq('p256dh', subscription.p256dh)
    .eq('auth', subscription.auth)
    .eq('updated_at', subscription.updated_at)
    .is('disabled_at', null)
    .limit(1)
    .maybeSingle();

  if (error) {
    logSupabaseError('isPushSubscriptionCurrent', error);
    return false;
  }
  return Boolean(data);
}

export async function disablePushSubscriptionIfCurrent(
  subscription: PushSubscriptionRow,
  failure?: { reason: string; statusCode?: number }
): Promise<void> {
  const changedAt = nowIso();
  const { error } = await supabase
    .from('admin_push_subscriptions')
    .update({
      disabled_at: changedAt,
      updated_at: changedAt,
      ...(failure ? {
        last_failure_at: changedAt,
        last_failure_reason: `[${failure.statusCode ?? 'n/a'}] ${failure.reason}`.slice(0, 1000),
      } : {}),
    })
    .eq('id', subscription.id)
    .eq('admin_id', subscription.admin_id)
    .eq('endpoint', subscription.endpoint)
    .eq('p256dh', subscription.p256dh)
    .eq('auth', subscription.auth)
    .eq('updated_at', subscription.updated_at)
    .is('disabled_at', null);
  if (error) {
    logSupabaseError('disablePushSubscriptionIfCurrent', error);
  }
}

export async function disablePushSubscriptionForAdminEndpoint(
  endpoint: string,
  adminId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('admin_push_subscriptions')
    .update({ disabled_at: nowIso(), updated_at: nowIso() })
    .eq('endpoint', endpoint)
    .eq('admin_id', adminId)
    .is('disabled_at', null);
  if (error) {
    logSupabaseError('disablePushSubscriptionForAdminEndpoint', error);
    return false;
  }
  return true;
}

export async function markPushDeliverySuccess(subscription: PushSubscriptionRow): Promise<void> {
  const { error } = await supabase
    .from('admin_push_subscriptions')
    .update({
      last_success_at: nowIso(),
      last_failure_at: null,
      last_failure_reason: null,
      updated_at: nowIso(),
    })
    .eq('id', subscription.id)
    .eq('admin_id', subscription.admin_id)
    .eq('endpoint', subscription.endpoint)
    .eq('p256dh', subscription.p256dh)
    .eq('auth', subscription.auth)
    .eq('updated_at', subscription.updated_at)
    .is('disabled_at', null);

  if (error) {
    logSupabaseError('markPushDeliverySuccess', error);
  }
}

export async function markPushDeliveryFailure(
  subscription: PushSubscriptionRow,
  reason: string,
  statusCode?: number
): Promise<void> {
  const { error } = await supabase
    .from('admin_push_subscriptions')
    .update({
      last_failure_at: nowIso(),
      last_failure_reason: `[${statusCode ?? 'n/a'}] ${reason}`.slice(0, 1000),
      updated_at: nowIso(),
    })
    .eq('id', subscription.id)
    .eq('admin_id', subscription.admin_id)
    .eq('endpoint', subscription.endpoint)
    .eq('p256dh', subscription.p256dh)
    .eq('auth', subscription.auth)
    .eq('updated_at', subscription.updated_at)
    .is('disabled_at', null);

  if (error) {
    logSupabaseError('markPushDeliveryFailure', error);
  }
}

export async function hasPushDeliveryLog(eventId: string, subscriptionId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('admin_push_delivery_logs')
    .select('id')
    .eq('event_id', eventId)
    .eq('subscription_id', subscriptionId)
    .limit(1)
    .maybeSingle();

  if (error) {
    logSupabaseError('hasPushDeliveryLog', error);
    return false;
  }

  return Boolean(data);
}

export async function createPushDeliveryLog(args: {
  eventId: string;
  subscriptionId: string;
  status: 'success' | 'failed';
  statusCode?: number;
  errorMessage?: string;
}): Promise<void> {
  const { error } = await supabase.from('admin_push_delivery_logs').insert({
    id: generateId(),
    event_id: args.eventId,
    subscription_id: args.subscriptionId,
    status: args.status,
    status_code: args.statusCode ?? null,
    error_message: args.errorMessage?.slice(0, 1000) ?? null,
    created_at: nowIso(),
  });

  if (error) {
    logSupabaseError('createPushDeliveryLog', error);
  }
}
