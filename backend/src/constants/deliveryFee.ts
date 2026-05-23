/** Keep in sync with shared/constants/delivery.ts */
export const DELIVERY_FEE_ORE = 7900;
export const DELIVERY_FEE_LINE_NAME = 'Leveransavgift';

export function isDeliveryFeeLineItem(item: {
  productId?: string | null;
  productName?: string | null;
}): boolean {
  const id = String(item.productId ?? '').trim();
  const name = String(item.productName ?? '').trim();
  return id === 'delivery-fee' || name === DELIVERY_FEE_LINE_NAME;
}
