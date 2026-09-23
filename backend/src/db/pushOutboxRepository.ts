import { logSupabaseError, nowIso, supabase, type Row } from './connection.js';
import type { AdminScope } from '../services/locationScope.js';

export type PushOutboxJob = {
  event_id: string;
  order_id: string;
  status: 'pending' | 'leased' | 'done' | 'dead';
  attempts: number;
  next_attempt_at: string;
  lease_token: string;
  lease_until: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export async function reconcilePushOutbox(): Promise<number> {
  const { data, error } = await supabase.rpc('reconcile_admin_push_outbox', { p_limit: 100 });
  if (error) {
    logSupabaseError('reconcilePushOutbox', error);
    throw error;
  }
  return Number(data ?? 0);
}

export async function claimPushOutboxJobs(): Promise<PushOutboxJob[]> {
  const { data, error } = await supabase.rpc('claim_admin_push_outbox', { p_limit: 10 });
  if (error) {
    logSupabaseError('claimPushOutboxJobs', error);
    throw error;
  }
  return ((data ?? []) as Row[]).map((row) => row as unknown as PushOutboxJob);
}

export async function settlePushOutboxJob(
  job: PushOutboxJob,
  status: 'pending' | 'done' | 'dead',
  lastError: string | null,
  delaySeconds = 0
): Promise<boolean> {
  const { data, error } = await supabase
    .from('admin_push_outbox')
    .update({
      status,
      next_attempt_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      lease_token: null,
      lease_until: null,
      last_error: lastError?.slice(0, 1000) ?? null,
      updated_at: nowIso(),
    })
    .eq('event_id', job.event_id)
    .eq('lease_token', job.lease_token)
    .eq('status', 'leased')
    .select('event_id');
  if (error) {
    logSupabaseError('settlePushOutboxJob', error);
    throw error;
  }
  return (data?.length ?? 0) === 1;
}

export async function getPushOutboxHealth(scope: AdminScope): Promise<{
  activeSubscriptions: number;
  pending: number;
  leased: number;
  dead: number;
  oldestPendingAt: string | null;
  deadJobs: Array<{ orderId: string; orderNumber: string; failedAt: string }>;
}> {
  const visible = (query: any): any => {
    if (scope.role !== 'location') return query;
    if (!scope.locationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scope.locationId)) {
      return query.eq('event_id', '00000000-0000-0000-0000-000000000000');
    }
    return scope.fulfillsDelivery
      ? query.or(`location_id.eq.${scope.locationId},order_type.eq.delivery`)
      : query.eq('location_id', scope.locationId);
  };
  const [subscriptions, pending, leased, dead, oldest, failed] = await Promise.all([
    supabase.from('admin_push_subscriptions').select('id', { head: true, count: 'exact' }).eq('admin_id', scope.adminId).is('disabled_at', null),
    visible(supabase.from('admin_push_outbox').select('event_id', { head: true, count: 'exact' }).eq('status', 'pending')),
    visible(supabase.from('admin_push_outbox').select('event_id', { head: true, count: 'exact' }).eq('status', 'leased')),
    visible(supabase.from('admin_push_outbox').select('event_id', { head: true, count: 'exact' }).eq('status', 'dead')),
    visible(supabase.from('admin_push_outbox').select('created_at').in('status', ['pending', 'leased']).order('created_at', { ascending: true }).limit(1)),
    visible(supabase.from('admin_push_outbox').select('order_id, updated_at, orders(order_number)').eq('status', 'dead').order('updated_at', { ascending: false }).limit(5)),
  ]);
  for (const [name, result] of [
    ['subscriptions', subscriptions], ['pending', pending], ['leased', leased], ['dead', dead], ['oldest', oldest], ['failed', failed],
  ] as const) {
    if (result.error) {
      logSupabaseError(`getPushOutboxHealth ${name}`, result.error);
      throw result.error;
    }
  }
  return {
    activeSubscriptions: subscriptions.count ?? 0,
    pending: pending.count ?? 0,
    leased: leased.count ?? 0,
    dead: dead.count ?? 0,
    oldestPendingAt: oldest.data?.[0]?.created_at ?? null,
    deadJobs: ((failed.data ?? []) as Row[]).map((row) => {
      const order = row.orders as Row | null;
      return {
        orderId: String(row.order_id),
        orderNumber: String(order?.order_number ?? row.order_id),
        failedAt: String(row.updated_at),
      };
    }),
  };
}
