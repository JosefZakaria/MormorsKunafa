/** Hemleverans i hela Sverige — 79 kr (server is source of truth at checkout). */
export const DELIVERY_FEE_ORE = 7900;
export const DELIVERY_FEE_SEK = 79;
export const DELIVERY_FEE_LINE_NAME = 'Leveransavgift';
export const DELIVERY_FEE_LINE_ID = 'delivery-fee';

export function isDeliveryFeeLineItem(item: {
  productId?: string | null;
  productName?: string | null;
}): boolean {
  const id = String(item.productId ?? '').trim();
  const name = String(item.productName ?? '').trim();
  return id === DELIVERY_FEE_LINE_ID || name === DELIVERY_FEE_LINE_NAME;
}
