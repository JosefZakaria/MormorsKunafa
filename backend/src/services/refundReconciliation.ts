import {
  finalizeOrderRefund,
  getRefundByProviderId,
  getRefundRecord,
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
} from './swishClient.js';

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
  if (!record || record.provider !== 'swish' || !record.providerRefundId) {
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
    providerRefundId: record.providerRefundId,
    originalPaymentReference: validation.originalPaymentReference,
    amountOre: record.amountOre,
  });
  return applyFinalOutcome(record, outcome);
}

export async function reconcileSwishRefundCallback(
  untrustedProviderRefundId: unknown
): Promise<'unknown' | 'pending' | 'succeeded' | 'failed'> {
  const providerRefundId = parseSwishRefundId(untrustedProviderRefundId);
  if (!providerRefundId) throw new Error('Invalid Swish refund callback identifier');
  const record = await getRefundByProviderId('swish', providerRefundId);
  if (!record) return 'unknown';
  return (await reconcileSwishRefund(record.id)).status;
}
