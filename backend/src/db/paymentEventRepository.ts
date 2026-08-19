import type { PaymentSecurityAlert } from '../shared/types/index.js';
import { logSupabaseError, supabase, type Row } from './connection.js';

export const PAYMENT_SECURITY_ALERT_OUTCOMES = [
  'alert_missing_order_id',
  'alert_order_not_found',
  'alert_paid_session_validation_failed',
] as const;

export function isPaymentSecurityAlertOutcome(
  value: unknown
): value is PaymentSecurityAlert['outcome'] {
  return (PAYMENT_SECURITY_ALERT_OUTCOMES as readonly unknown[]).includes(value);
}

export async function claimStripeEvent(
  eventId: string,
  eventType: string,
  livemode: boolean
): Promise<boolean> {
  const { data, error } = await supabase.rpc('claim_stripe_event', {
    p_event_id: eventId,
    p_event_type: eventType,
    p_livemode: livemode,
  });
  if (error) {
    logSupabaseError('claimStripeEvent', error);
    throw error;
  }
  return data === true;
}

export async function completeStripeEvent(
  eventId: string,
  orderId: string | null,
  outcome: string
): Promise<void> {
  const { error } = await supabase.rpc('complete_stripe_event', {
    p_event_id: eventId,
    p_order_id: orderId ?? '',
    p_outcome: outcome,
  });
  if (error) {
    logSupabaseError('completeStripeEvent', error);
    throw error;
  }
}

export async function failStripeEvent(eventId: string): Promise<void> {
  const { error } = await supabase.rpc('fail_stripe_event', { p_event_id: eventId });
  if (error) {
    logSupabaseError('failStripeEvent', error);
    throw error;
  }
}

export async function listPaymentSecurityAlerts(limit = 25): Promise<PaymentSecurityAlert[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Payment alert limit must be between 1 and 100');
  }
  const { data, error } = await supabase
    .from('payment_provider_events')
    .select('event_id, event_type, outcome, order_id, received_at, processed_at')
    .eq('provider', 'stripe')
    .eq('status', 'processed')
    .in('outcome', [...PAYMENT_SECURITY_ALERT_OUTCOMES])
    .order('received_at', { ascending: false })
    .limit(100);
  if (error) {
    logSupabaseError('list payment security alerts', error);
    throw error;
  }
  const alerts = (data ?? []).flatMap((raw) => {
    const row = raw as Row;
    const outcome = row.outcome;
    const eventId = String(row.event_id ?? '');
    const eventType = String(row.event_type ?? '');
    const receivedAt = String(row.received_at ?? '');
    if (
      !isPaymentSecurityAlertOutcome(outcome)
      || !/^evt_[A-Za-z0-9_]{8,255}$/.test(eventId)
      || eventType !== 'checkout.session.completed'
      || !Number.isFinite(Date.parse(receivedAt))
    ) return [];
    const orderId = String(row.order_id ?? '').trim();
    const processedAt = String(row.processed_at ?? '').trim();
    return [{
      eventId,
      eventType,
      outcome,
      ...(orderId ? { orderId } : {}),
      receivedAt,
      ...(processedAt && Number.isFinite(Date.parse(processedAt)) ? { processedAt } : {}),
    }];
  });
  if (alerts.length === 0) return alerts;

  const { data: resolved, error: resolvedError } = await supabase
    .from('duplicate_stripe_refunds')
    .select('stripe_event_id')
    .in('stripe_event_id', alerts.map((alert) => alert.eventId))
    .eq('status', 'succeeded');
  if (resolvedError) {
    logSupabaseError('list resolved duplicate Stripe refunds', resolvedError);
    throw resolvedError;
  }
  const resolvedEventIds = new Set(
    (resolved ?? []).map((row) => String((row as Row).stripe_event_id ?? ''))
  );
  return alerts.filter((alert) => !resolvedEventIds.has(alert.eventId)).slice(0, limit);
}

export async function getPaymentSecurityAlert(eventId: string): Promise<PaymentSecurityAlert | null> {
  if (!/^evt_[A-Za-z0-9_]{8,255}$/.test(eventId)) return null;
  const { data, error } = await supabase
    .from('payment_provider_events')
    .select('event_id, event_type, outcome, order_id, received_at, processed_at')
    .eq('provider', 'stripe')
    .eq('event_id', eventId)
    .eq('status', 'processed')
    .maybeSingle();
  if (error) {
    logSupabaseError('get payment security alert', error);
    throw error;
  }
  if (!data) return null;
  const row = data as Row;
  if (
    !isPaymentSecurityAlertOutcome(row.outcome)
    || row.event_type !== 'checkout.session.completed'
    || !Number.isFinite(Date.parse(String(row.received_at ?? '')))
  ) return null;
  const orderId = String(row.order_id ?? '').trim();
  const processedAt = String(row.processed_at ?? '').trim();
  return {
    eventId,
    eventType: 'checkout.session.completed',
    outcome: row.outcome,
    ...(orderId ? { orderId } : {}),
    receivedAt: String(row.received_at),
    ...(processedAt && Number.isFinite(Date.parse(processedAt)) ? { processedAt } : {}),
  };
}
