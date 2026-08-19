import { logSupabaseError, supabase, type Row } from './connection.js';
import { isCanonicalUuidV4 } from '../utils/resourceId.js';
import { parseSwishInstructionId } from '../services/swishClient.js';

export type InitiatedCheckoutDraft = {
  orderId: string;
  paymentMethod: 'card' | 'app' | 'swish';
  totalOre: number;
  stripeCheckoutSessionId?: string;
  swishInstructionId?: string;
};

function parseDraft(row: Row): InitiatedCheckoutDraft {
  const orderId = String(row.order_id ?? '');
  const paymentMethod = String(row.payment_method ?? '').trim().toLowerCase();
  const totalOre = Number(row.total_ore);
  const stripeCheckoutSessionId = String(row.stripe_checkout_session_id ?? '').trim();
  const swishInstructionId = parseSwishInstructionId(row.swish_instruction_id);

  if (!isCanonicalUuidV4(orderId)) throw new Error('Checkout cleanup returned an invalid order ID');
  if (!['card', 'app', 'swish'].includes(paymentMethod)) {
    throw new Error('Checkout cleanup returned an invalid payment method');
  }
  if (!Number.isSafeInteger(totalOre) || totalOre <= 0) {
    throw new Error('Checkout cleanup returned an invalid order total');
  }
  if (paymentMethod === 'swish') {
    if (!swishInstructionId || stripeCheckoutSessionId) {
      throw new Error('Checkout cleanup returned ambiguous Swish provider identifiers');
    }
    return { orderId, paymentMethod, totalOre, swishInstructionId };
  }
  if (!stripeCheckoutSessionId || stripeCheckoutSessionId.length > 255 || swishInstructionId) {
    throw new Error('Checkout cleanup returned ambiguous Stripe provider identifiers');
  }
  return { orderId, paymentMethod: paymentMethod as 'card' | 'app', totalOre, stripeCheckoutSessionId };
}

export async function listInitiatedCheckoutDrafts(
  before: string,
  limit: number
): Promise<InitiatedCheckoutDraft[]> {
  const { data, error } = await supabase.rpc('list_initiated_checkout_drafts', {
    p_before: before,
    p_limit: limit,
  });
  if (error) {
    logSupabaseError('list initiated checkout drafts', error);
    throw error;
  }
  if (!Array.isArray(data) || data.length > limit) {
    throw new Error('Checkout cleanup returned an invalid candidate list');
  }
  return data.map((row) => parseDraft(row as Row));
}

export async function deleteReconciledCheckoutDraft(
  draft: InitiatedCheckoutDraft,
  before: string
): Promise<boolean> {
  const providerReference = draft.paymentMethod === 'swish'
    ? draft.swishInstructionId
    : draft.stripeCheckoutSessionId;
  if (!providerReference) throw new Error('Checkout cleanup provider reference is missing');

  const { data, error } = await supabase.rpc('delete_reconciled_checkout_draft', {
    p_order_id: draft.orderId,
    p_payment_method: draft.paymentMethod,
    p_provider_reference: providerReference,
    p_before: before,
  });
  if (error) {
    logSupabaseError('delete reconciled checkout draft', error);
    throw error;
  }
  return data === true;
}
