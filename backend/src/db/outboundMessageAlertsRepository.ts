import type { OutboundMessageFailureAlert } from '@mormors-kunafa/shared/types';
import { logSupabaseError, supabase, type Row } from './connection.js';
import { isCanonicalUuidV4 } from '../utils/resourceId.js';
import { orderRowVisibleToScope, type AdminScope } from '../services/locationScope.js';

const FAILURE_STATUSES = ['retryable', 'uncertain', 'permanent_failed'] as const;
const FAILURE_STATUS_SET = new Set<string>(FAILURE_STATUSES);
const EVENT_KEYS = new Set(['order_confirmation', 'order_accepted']);
const CHANNELS = new Set(['email', 'sms']);
const SAFE_ERROR_CODE = /^[a-z0-9_]{1,64}$/;
const PAGE_SIZE = 100;

function orderLocationVisibleToScope(scope: AdminScope, order: Row): boolean {
  return orderRowVisibleToScope(scope, order);
}

/**
 * Convert database rows to the deliberately small staff DTO. Customer contact,
 * message_data, provider ids/responses and HTTP bodies never enter this mapper.
 */
export function outboundMessageFailureAlertsFromRows(
  jobRows: Row[],
  orderRows: Row[],
  scope: AdminScope,
  limit: number
): OutboundMessageFailureAlert[] {
  const orders = new Map(orderRows.map((row) => [String(row.id ?? ''), row]));
  const alerts: OutboundMessageFailureAlert[] = [];

  for (const row of jobRows) {
    if (alerts.length >= limit) break;
    const id = String(row.id ?? '');
    const orderId = String(row.order_id ?? '');
    const order = orders.get(orderId);
    const event = String(row.event_key ?? '');
    const channel = String(row.channel ?? '');
    const status = String(row.status ?? '');
    const attemptCount = Number(row.attempt_count);
    const maxAttempts = Number(row.max_attempts);
    const updatedAt = String(row.updated_at ?? '');
    const orderNumber = String(order?.order_number ?? '');

    if (
      !isCanonicalUuidV4(id)
      || !isCanonicalUuidV4(orderId)
      || !order
      || !orderLocationVisibleToScope(scope, order)
      || !/^#[0-9]+$/.test(orderNumber)
      || !EVENT_KEYS.has(event)
      || !CHANNELS.has(channel)
      || !FAILURE_STATUS_SET.has(status)
      || !Number.isSafeInteger(attemptCount)
      || !Number.isSafeInteger(maxAttempts)
      || attemptCount < 0
      || maxAttempts < 1
      || attemptCount > maxAttempts
      || !Number.isFinite(Date.parse(updatedAt))
    ) {
      continue;
    }

    const rawErrorCode = String(row.last_error_code ?? '');
    alerts.push({
      id,
      orderNumber,
      channel: channel as OutboundMessageFailureAlert['channel'],
      event: event as OutboundMessageFailureAlert['event'],
      status: status as OutboundMessageFailureAlert['status'],
      attemptCount,
      maxAttempts,
      errorCode: SAFE_ERROR_CODE.test(rawErrorCode) ? rawErrorCode : 'unknown_delivery_error',
      updatedAt: new Date(updatedAt).toISOString(),
    });
  }

  return alerts;
}

export async function listOutboundMessageFailureAlerts(
  scope: AdminScope,
  limit = 50
): Promise<OutboundMessageFailureAlert[]> {
  const alerts: OutboundMessageFailureAlert[] = [];
  let from = 0;

  while (alerts.length < limit) {
    const { data: jobs, error: jobsError } = await supabase
      .from('outbound_message_jobs')
      .select('id, order_id, event_key, channel, status, attempt_count, max_attempts, last_error_code, updated_at')
      .in('status', [...FAILURE_STATUSES])
      .order('updated_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (jobsError) {
      logSupabaseError('listOutboundMessageFailureAlerts jobs', jobsError);
      throw jobsError;
    }

    const jobRows = (jobs ?? []) as Row[];
    if (jobRows.length === 0) break;
    const orderIds = [...new Set(jobRows.map((row) => String(row.order_id ?? '')).filter(Boolean))];
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, order_number, order_type, location_id')
      .in('id', orderIds);
    if (ordersError) {
      logSupabaseError('listOutboundMessageFailureAlerts orders', ordersError);
      throw ordersError;
    }

    alerts.push(...outboundMessageFailureAlertsFromRows(
      jobRows,
      (orders ?? []) as Row[],
      scope,
      limit - alerts.length
    ));
    if (jobRows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return alerts;
}
