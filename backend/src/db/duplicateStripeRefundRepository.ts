import { generateId, logSupabaseError, nowIso, supabase, type Row } from './connection.js';

export type DuplicateStripeRefundRecord = {
  id: string;
  eventId: string;
  orderId: string;
  sessionId: string;
  paymentIntentId: string;
  amountOre: number;
  status: 'pending' | 'succeeded' | 'failed';
  providerRefundId?: string;
  created: boolean;
};

function requiredString(value: unknown, field: string): string {
  const result = String(value ?? '').trim();
  if (!result) throw new Error(`Duplicate refund repository returned an invalid ${field}`);
  return result;
}

function parseStatus(value: unknown): DuplicateStripeRefundRecord['status'] {
  if (value !== 'pending' && value !== 'succeeded' && value !== 'failed') {
    throw new Error('Duplicate refund repository returned an invalid status');
  }
  return value;
}

function parseStored(row: Row, created: boolean): DuplicateStripeRefundRecord {
  const amountOre = Number(row.amount_ore);
  if (!Number.isSafeInteger(amountOre) || amountOre <= 0) {
    throw new Error('Duplicate refund repository returned an invalid amount');
  }
  return {
    id: requiredString(row.id, 'refund id'),
    eventId: requiredString(row.stripe_event_id, 'event id'),
    orderId: requiredString(row.order_id, 'order id'),
    sessionId: requiredString(row.stripe_session_id, 'session id'),
    paymentIntentId: requiredString(row.payment_intent_id, 'payment intent id'),
    amountOre,
    status: parseStatus(row.status),
    providerRefundId: String(row.provider_refund_id ?? '').trim() || undefined,
    created,
  };
}

export async function getDuplicateStripeRefundByEvent(
  eventId: string
): Promise<DuplicateStripeRefundRecord | null> {
  const { data, error } = await supabase
    .from('duplicate_stripe_refunds')
    .select('id, stripe_event_id, order_id, stripe_session_id, payment_intent_id, amount_ore, status, provider_refund_id')
    .eq('stripe_event_id', eventId)
    .maybeSingle();
  if (error) {
    logSupabaseError('getDuplicateStripeRefundByEvent', error);
    throw error;
  }
  return data ? parseStored(data as Row, false) : null;
}

export async function getDuplicateStripeRefundByProviderId(
  providerRefundId: string
): Promise<DuplicateStripeRefundRecord | null> {
  const { data, error } = await supabase
    .from('duplicate_stripe_refunds')
    .select('id, stripe_event_id, order_id, stripe_session_id, payment_intent_id, amount_ore, status, provider_refund_id')
    .eq('provider_refund_id', providerRefundId)
    .maybeSingle();
  if (error) {
    logSupabaseError('getDuplicateStripeRefundByProviderId', error);
    throw error;
  }
  return data ? parseStored(data as Row, false) : null;
}

export async function reserveDuplicateStripeRefund(input: {
  eventId: string;
  orderId: string;
  sessionId: string;
  paymentIntentId: string;
  amountOre: number;
  adminId: string;
  idempotencyKey: string;
}): Promise<DuplicateStripeRefundRecord> {
  const { data, error } = await supabase.rpc('reserve_duplicate_stripe_refund', {
    p_refund_id: generateId(),
    p_stripe_event_id: input.eventId,
    p_order_id: input.orderId,
    p_stripe_session_id: input.sessionId,
    p_payment_intent_id: input.paymentIntentId,
    p_amount_ore: input.amountOre,
    p_admin_id: input.adminId,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) {
    logSupabaseError('reserveDuplicateStripeRefund', error);
    throw error;
  }
  const result = Array.isArray(data) ? data[0] as Row | undefined : undefined;
  if (!result) throw new Error('Duplicate refund reservation returned no record');
  const stored = await getDuplicateStripeRefundByEvent(input.eventId);
  if (!stored || stored.id !== requiredString(result.refund_id, 'refund id')) {
    throw new Error('Duplicate refund reservation was not visible after creation');
  }
  return { ...stored, status: parseStatus(result.status), created: result.created === true };
}

export async function setDuplicateStripeRefundProviderReference(
  refundId: string,
  providerRefundId: string
): Promise<void> {
  const { data, error } = await supabase.rpc('set_duplicate_stripe_refund_provider_reference', {
    p_refund_id: refundId,
    p_provider_refund_id: providerRefundId,
  });
  if (error) {
    logSupabaseError('setDuplicateStripeRefundProviderReference', error);
    throw error;
  }
  if (data !== true) throw new Error('Duplicate refund is not pending or has another Stripe refund id');
}

export async function finalizeDuplicateStripeRefund(input: {
  refundId: string;
  succeeded: boolean;
  failureCode?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('finalize_duplicate_stripe_refund', {
    p_refund_id: input.refundId,
    p_succeeded: input.succeeded,
    p_failure_code: input.failureCode ?? '',
    p_completed_at: nowIso(),
    p_audit_event_id: generateId(),
  });
  if (error) {
    logSupabaseError('finalizeDuplicateStripeRefund', error);
    throw error;
  }
}
