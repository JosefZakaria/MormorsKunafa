export const ORDER_STATUSES = [
  'ny',
  'mottagen',
  'påbörjad',
  'klar',
  'avbruten',
  'uthämtad',
  'levererad',
] as const;

export type OrderStatusValue = (typeof ORDER_STATUSES)[number];

const allowedTransitions: Record<OrderStatusValue, readonly OrderStatusValue[]> = {
  ny: ['mottagen', 'avbruten'],
  mottagen: ['påbörjad', 'klar', 'avbruten'],
  påbörjad: ['klar', 'avbruten'],
  klar: ['uthämtad', 'levererad'],
  avbruten: [],
  uthämtad: [],
  levererad: [],
};

export function isOrderStatus(value: unknown): value is OrderStatusValue {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function canTransitionOrderStatus(
  current: OrderStatusValue,
  next: OrderStatusValue
): boolean {
  return allowedTransitions[current].includes(next);
}

export function canUseGeneralStatusRoute(next: OrderStatusValue): boolean {
  return next === 'påbörjad' || next === 'klar' || next === 'uthämtad' || next === 'levererad';
}
