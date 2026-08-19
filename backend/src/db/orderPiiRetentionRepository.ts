import { logSupabaseError, supabase, type Row } from './connection.js';
import { isCanonicalUuidV4 } from '../utils/resourceId.js';

const TERMINAL_STATUSES = new Set(['uthämtad', 'levererad', 'avbruten']);
const PAYMENT_STATUSES = new Set(['pending', 'paid']);

export type OperationalPiiRetentionCandidate = {
  orderId: string;
  orderNumber: string;
  terminalAt: string;
  orderStatus: string;
  paymentStatus: string;
};

export function parseOperationalPiiRetentionCandidate(
  row: Row
): OperationalPiiRetentionCandidate {
  const orderId = String(row.order_id ?? '');
  const orderNumber = String(row.order_number ?? '').trim();
  const terminalAt = String(row.terminal_at ?? '');
  const orderStatus = String(row.order_status ?? '');
  const paymentStatus = String(row.payment_status ?? '');
  if (!isCanonicalUuidV4(orderId)) throw new Error('PII retention returned an invalid order ID');
  if (!orderNumber || orderNumber.length > 64) {
    throw new Error('PII retention returned an invalid order number');
  }
  if (!Number.isFinite(Date.parse(terminalAt))) {
    throw new Error('PII retention returned an invalid terminal timestamp');
  }
  if (!TERMINAL_STATUSES.has(orderStatus) || !PAYMENT_STATUSES.has(paymentStatus)) {
    throw new Error('PII retention returned an invalid order state');
  }
  return { orderId, orderNumber, terminalAt, orderStatus, paymentStatus };
}

export async function previewOperationalOrderPiiRetention(
  before: string,
  limit: number
): Promise<OperationalPiiRetentionCandidate[]> {
  const { data, error } = await supabase.rpc('preview_operational_order_pii_retention', {
    p_before: before,
    p_limit: limit,
  });
  if (error) {
    logSupabaseError('preview operational order PII retention', error);
    throw error;
  }
  if (!Array.isArray(data) || data.length > limit) {
    throw new Error('PII retention returned an invalid candidate list');
  }
  return data.map((row) => parseOperationalPiiRetentionCandidate(row as Row));
}

export async function anonymizeOperationalOrderPii(
  before: string,
  limit: number
): Promise<number> {
  const { data, error } = await supabase.rpc('anonymize_operational_order_pii', {
    p_before: before,
    p_limit: limit,
  });
  if (error) {
    logSupabaseError('anonymize operational order PII', error);
    throw error;
  }
  const count = Number(data);
  if (!Number.isSafeInteger(count) || count < 0 || count > limit) {
    throw new Error('PII retention returned an invalid anonymization count');
  }
  return count;
}
