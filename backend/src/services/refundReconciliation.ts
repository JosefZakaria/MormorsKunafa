import {
  finalizeOrderRefund,
  getRefundByProviderId,
  getRefundRecord,
  setRefundProviderReference,
  type RefundRecord,
} from '../db/refundRepository.js';
import { getOrderById } from '../db/orderRepository.js';
import {
  getStripeRefundOutcome,
  getSwishRefundOutcome,
  validateOriginalSwishPayment,
  type ProviderRefundOutcome,
} from './refundProviders.js';
import {
  getSwishPaymentRequest,
  parseSwishInstructionId,
  parseSwishRefundId,
  swishRefundIdFromUuid,
} from './swishClient.js';
import { isCanonicalUuidV4 } from '../utils/resourceId.js';

async function applyFinalOutcome(
  record: RefundRecord,
  outcome: ProviderRefundOutcome
): Promise<ProviderRefundOutcome> {
  if (outcome.status !== 'pending' && record.status === 'pending') {
    await finalizeOrderRefund({
      refundId: record.id,
      succeeded: outcome.status === 'succeeded',
      failureCode: outcome.failureCode,
    });
  }
  return outcome;
}

export async function reconcileStripeRefund(refundId: string): Promise<ProviderRefundOutcome> {
  const record = await getRefundRecord(refundId);
  if (!record || record.provider !== 'stripe' || !record.providerRefundId) {
    throw new Error('Stripe refund record is incomplete');
  }
  return applyFinalOutcome(record, await getStripeRefundOutcome(record.providerRefundId));
}

export async function reconcileSwishRefund(refundId: string): Promise<ProviderRefundOutcome> {
  const record = await getRefundRecord(refundId);
  if (!record || record.provider !== 'swish') {
    throw new Error('Swish refund record is incomplete');
  }
  const result = await getOrderById(record.orderId);
  if (!result) throw new Error('Refund order was not found');
  const instructionId = parseSwishInstructionId(result.order.swish_instruction_id);
  const merchantAlias = process.env.SWISH_PAYEE_ALIAS?.trim() ?? '';
  const totalPaidOre = Number(result.order.total_ore);
  if (!instructionId || !merchantAlias || !Number.isSafeInteger(totalPaidOre) || totalPaidOre <= 0) {
    throw new Error('Original Swish order is inconsistent');
  }
  const original = await getSwishPaymentRequest(instructionId);
  const validation = validateOriginalSwishPayment(original, {
    instructionId,
    orderId: record.orderId,
    totalPaidOre,
    merchantAlias,
  });
  if (!validation.ok) throw new Error(validation.reason);
  const outcome = await getSwishRefundOutcome({
    providerRefundId: record.providerRefundId ?? swishRefundIdFromUuid(record.id),
    originalPaymentReference: validation.originalPaymentReference,
    amountOre: record.amountOre,
  });
  if (!record.providerRefundId) await setRefundProviderReference(record.id, outcome.providerRefundId);
  return applyFinalOutcome(record, outcome);
}

export async function reconcileSwishRefundCallback(
  untrustedProviderRefundId: unknown
): Promise<'unknown' | 'pending' | 'succeeded' | 'failed'> {
  const providerRefundId = parseSwishRefundId(untrustedProviderRefundId);
  if (!providerRefundId) throw new Error('Invalid Swish refund callback identifier');
  let record = await getRefundByProviderId('swish', providerRefundId);
  if (!record) {
    // Historical accepted attempts may lack the reference. Recover only the
    // reserved deterministic ID, then authenticate and validate provider state.
    const id=providerRefundId.toLowerCase();
    const refundId=`${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`;
    if (!isCanonicalUuidV4(refundId)) return 'unknown';
    const candidate=await getRefundRecord(refundId);
    if (candidate?.provider === 'swish' && !candidate.providerRefundId) record=candidate;
  }
  if (!record) return 'unknown';
  return (await reconcileSwishRefund(record.id)).status;
}
