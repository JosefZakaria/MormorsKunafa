import { logSupabaseError, supabase } from './connection.js';

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
