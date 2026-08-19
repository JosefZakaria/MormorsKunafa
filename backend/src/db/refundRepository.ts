import type {
  AdminRefundOverview,
  OrderRefundAllocation,
  OrderRefundAttempt,
  RefundStatus,
} from '../shared/types/index.js';
import { generateId, logSupabaseError, nowIso, supabase, type Row } from './connection.js';
import { getOrderById } from './orderRepository.js';
import type { RefundSelection } from '../utils/refundSelection.js';

export type ReservedRefund = {
  refundId: string;
  amountOre: number;
  provider: 'stripe' | 'swish';
  orderNumber: string;
  stripeCheckoutSessionId?: string;
  swishInstructionId?: string;
  created: boolean;
};

export type RefundRecord = {
  id: string;
  orderId: string;
  provider: 'stripe' | 'swish';
  amountOre: number;
  status: 'pending' | 'succeeded' | 'failed';
  providerRefundId?: string;
};

function requiredString(value: unknown, field: string): string {
  const result = String(value ?? '').trim();
  if (!result) throw new Error(`Refund repository returned an invalid ${field}`);
  return result;
}

function safeOre(value: unknown, field: string, allowZero = false): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < (allowZero ? 0 : 1)) {
    throw new Error(`Refund repository returned an invalid ${field}`);
  }
  return amount;
}

export async function reserveOrderRefund(input: {
  orderId: string;
  adminId: string;
  idempotencyKey: string;
  items: RefundSelection[];
}): Promise<ReservedRefund> {
  const refundId = generateId();
  const { data, error } = await supabase.rpc('reserve_order_refund', {
    p_refund_id: refundId,
    p_order_id: input.orderId,
    p_admin_id: input.adminId,
    p_idempotency_key: input.idempotencyKey,
    p_items: input.items,
  });
  if (error) {
    logSupabaseError('reserveOrderRefund', error);
    throw error;
  }
  const row = Array.isArray(data) ? data[0] as Row | undefined : undefined;
  const provider = requiredString(row?.provider, 'provider');
  if (provider !== 'stripe' && provider !== 'swish') {
    throw new Error('Refund repository returned an unsupported provider');
  }
  return {
    refundId: requiredString(row?.refund_id, 'refund id'),
    amountOre: safeOre(row?.amount_ore, 'refund amount'),
    provider,
    orderNumber: requiredString(row?.order_number, 'order number'),
    stripeCheckoutSessionId: String(row?.stripe_checkout_session_id ?? '').trim() || undefined,
    swishInstructionId: String(row?.swish_instruction_id ?? '').trim() || undefined,
    created: row?.created === true,
  };
}

export async function setRefundProviderReference(refundId: string, providerRefundId: string): Promise<void> {
  const { data, error } = await supabase.rpc('set_order_refund_provider_reference', {
    p_refund_id: refundId,
    p_provider_refund_id: providerRefundId,
  });
  if (error) {
    logSupabaseError('setRefundProviderReference', error);
    throw error;
  }
  if (data !== true) throw new Error('Refund is no longer pending or has another provider reference');
}

export async function finalizeOrderRefund(input: {
  refundId: string;
  succeeded: boolean;
  failureCode?: string;
}): Promise<{ orderId: string; refundStatus: RefundStatus; orderStatus: string }> {
  const { data, error } = await supabase.rpc('finalize_order_refund', {
    p_refund_id: input.refundId,
    p_succeeded: input.succeeded,
    p_failure_code: input.failureCode ?? '',
    p_completed_at: nowIso(),
    p_event_id: generateId(),
  });
  if (error) {
    logSupabaseError('finalizeOrderRefund', error);
    throw error;
  }
  const row = Array.isArray(data) ? data[0] as Row | undefined : undefined;
  return {
    orderId: requiredString(row?.order_id, 'order id'),
    refundStatus: requiredString(row?.refund_status, 'refund status') as RefundStatus,
    orderStatus: requiredString(row?.order_status, 'order status'),
  };
}

export async function getRefundRecord(refundId: string): Promise<RefundRecord | null> {
  const { data, error } = await supabase
    .from('order_refunds')
    .select('id, order_id, provider, amount_ore, status, provider_refund_id')
    .eq('id', refundId)
    .maybeSingle();
  if (error) {
    logSupabaseError('getRefundRecord', error);
    throw error;
  }
  if (!data) return null;
  const row = data as Row;
  return {
    id: requiredString(row.id, 'refund id'),
    orderId: requiredString(row.order_id, 'order id'),
    provider: requiredString(row.provider, 'provider') as 'stripe' | 'swish',
    amountOre: safeOre(row.amount_ore, 'amount'),
    status: requiredString(row.status, 'status') as RefundRecord['status'],
    providerRefundId: String(row.provider_refund_id ?? '').trim() || undefined,
  };
}

export async function getRefundByProviderId(
  provider: 'stripe' | 'swish',
  providerRefundId: string
): Promise<RefundRecord | null> {
  const { data, error } = await supabase
    .from('order_refunds')
    .select('id, order_id, provider, amount_ore, status, provider_refund_id')
    .eq('provider', provider)
    .eq('provider_refund_id', providerRefundId)
    .maybeSingle();
  if (error) {
    logSupabaseError('getRefundByProviderId', error);
    throw error;
  }
  if (!data) return null;
  const row = data as Row;
  return {
    id: requiredString(row.id, 'refund id'),
    orderId: requiredString(row.order_id, 'order id'),
    provider: provider,
    amountOre: safeOre(row.amount_ore, 'amount'),
    status: requiredString(row.status, 'status') as RefundRecord['status'],
    providerRefundId: requiredString(row.provider_refund_id, 'provider refund id'),
  };
}

export async function getAdminRefundOverview(orderId: string): Promise<AdminRefundOverview | null> {
  const result = await getOrderById(orderId);
  if (!result) return null;

  const { data: refundsData, error: refundsError } = await supabase
    .from('order_refunds')
    .select('id, amount_ore, status, created_at, completed_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });
  if (refundsError) {
    logSupabaseError('getAdminRefundOverview refunds', refundsError);
    throw refundsError;
  }
  const refundRows = (refundsData ?? []) as Row[];
  const refundIds = refundRows.map((row) => String(row.id));
  let allocationRows: Row[] = [];
  if (refundIds.length > 0) {
    const { data, error } = await supabase
      .from('order_refund_items')
      .select('refund_id, order_item_id, quantity, amount_ore')
      .in('refund_id', refundIds);
    if (error) {
      logSupabaseError('getAdminRefundOverview allocations', error);
      throw error;
    }
    allocationRows = (data ?? []) as Row[];
  }

  const statusByRefund = new Map(refundRows.map((row) => [String(row.id), String(row.status)]));
  const refundedByItem = new Map<string, number>();
  const pendingByItem = new Map<string, number>();
  for (const allocation of allocationRows) {
    const status = statusByRefund.get(String(allocation.refund_id));
    const target = status === 'succeeded' ? refundedByItem : status === 'pending' ? pendingByItem : null;
    if (!target) continue;
    const itemId = String(allocation.order_item_id);
    target.set(itemId, (target.get(itemId) ?? 0) + Number(allocation.quantity));
  }

  const allocationsByRefund = new Map<string, OrderRefundAllocation[]>();
  for (const row of allocationRows) {
    const refundId = String(row.refund_id);
    const allocations = allocationsByRefund.get(refundId) ?? [];
    allocations.push({
      orderItemId: String(row.order_item_id),
      quantity: Number(row.quantity),
      amount: Number(row.amount_ore),
    });
    allocationsByRefund.set(refundId, allocations);
  }
  const attempts: OrderRefundAttempt[] = refundRows.map((row) => ({
    id: String(row.id),
    amount: Number(row.amount_ore),
    status: String(row.status) as OrderRefundAttempt['status'],
    createdAt: String(row.created_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    allocations: allocationsByRefund.get(String(row.id)) ?? [],
  }));

  const order = result.order;
  const totalPrice = safeOre(order.total_ore, 'order total');
  const refundedAmount = safeOre(order.refunded_amount_ore ?? 0, 'refunded amount', true);
  const pendingAmount = refundRows
    .filter((row) => row.status === 'pending')
    .reduce((sum, row) => sum + safeOre(row.amount_ore, 'pending amount'), 0);
  const items = result.items.map((row) => {
    const id = requiredString(row.id, 'order item id');
    const orderedQuantity = Number(row.quantity);
    const refundedQuantity = refundedByItem.get(id) ?? 0;
    const pendingQuantity = pendingByItem.get(id) ?? 0;
    return {
      orderItemId: id,
      productName: requiredString(row.product_name_snapshot, 'product name'),
      unitPrice: safeOre(row.price_ore, 'unit price'),
      orderedQuantity,
      pendingQuantity,
      refundedQuantity,
      refundableQuantity: Math.max(0, orderedQuantity - pendingQuantity - refundedQuantity),
      isDeliveryFee: row.product_id == null,
    };
  });

  return {
    orderId: requiredString(order.id, 'order id'),
    orderNumber: requiredString(order.order_number, 'order number'),
    paymentMethod: requiredString(order.payment_method, 'payment method') as AdminRefundOverview['paymentMethod'],
    paymentStatus: requiredString(order.payment_status, 'payment status') as AdminRefundOverview['paymentStatus'],
    refundStatus: requiredString(order.refund_status ?? 'none', 'refund status') as RefundStatus,
    totalPrice,
    refundedAmount,
    pendingAmount,
    refundableAmount: Math.max(0, totalPrice - refundedAmount - pendingAmount),
    items,
    attempts,
  };
}
