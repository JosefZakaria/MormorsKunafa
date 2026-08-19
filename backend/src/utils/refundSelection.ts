import { isCanonicalUuidV4 } from './resourceId.js';

const MAX_REFUND_ROWS = 50;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

export type RefundSelection = {
  orderItemId: string;
  quantity: number;
};

export class RefundInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RefundInputError';
  }
}

export function expectedRefundConfirmation(orderNumber: string): string {
  return `ÅTERBETALA ${orderNumber}`;
}

export function parseRefundIdempotencyKey(value: unknown): string {
  const key = typeof value === 'string' ? value.trim() : '';
  if (!IDEMPOTENCY_PATTERN.test(key)) {
    throw new RefundInputError('En giltig idempotency-nyckel krävs.');
  }
  return key;
}

export function parseRefundRequest(
  value: unknown,
  orderNumber: string
): { password: string; confirmation: string; items: RefundSelection[] } {
  if (!value || typeof value !== 'object') {
    throw new RefundInputError('Återbetalningsbegäran är ogiltig.');
  }
  const body = value as Record<string, unknown>;
  const password = typeof body.password === 'string' ? body.password : '';
  const confirmation = typeof body.confirmation === 'string' ? body.confirmation : '';
  if (!password || password.length > 256) {
    throw new RefundInputError('Återbetalningslösenord krävs.');
  }
  if (confirmation !== expectedRefundConfirmation(orderNumber)) {
    throw new RefundInputError('Bekräftelsetexten stämmer inte med ordern.');
  }
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > MAX_REFUND_ROWS) {
    throw new RefundInputError(`Välj mellan 1 och ${MAX_REFUND_ROWS} orderrader.`);
  }

  const seen = new Set<string>();
  const items = body.items.map((raw) => {
    if (!raw || typeof raw !== 'object') {
      throw new RefundInputError('En vald orderrad är ogiltig.');
    }
    const item = raw as Record<string, unknown>;
    const orderItemId = typeof item.orderItemId === 'string'
      ? item.orderItemId.trim().toLowerCase()
      : '';
    if (!isCanonicalUuidV4(orderItemId) || seen.has(orderItemId)) {
      throw new RefundInputError('Valda orderrader måste vara unika och giltiga.');
    }
    if (!Number.isInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 50) {
      throw new RefundInputError('Återbetalningsantal måste vara ett heltal mellan 1 och 50.');
    }
    seen.add(orderItemId);
    return { orderItemId, quantity: Number(item.quantity) };
  });

  return { password, confirmation, items };
}
