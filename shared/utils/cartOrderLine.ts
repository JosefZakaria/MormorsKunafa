/**
 * Keep the locked-main wire shape during rollout. Current servers treat the
 * compatibility name/price as untrusted and resolve both from the catalog.
 */
export function cartItemToOrderLine(item: {
  productId: string;
  productName?: string;
  price?: number;
  quantity: number;
}) {
  const rawProductId = item.productId.trim();
  const productId = rawProductId.slice(0, 36).toLowerCase();
  const suffix = rawProductId.slice(36);
  // A label such as "3 st" may be a real bundle. Only the server catalog can
  // distinguish that from the quantity label used by old per-piece carts.
  const variantId = suffix.startsWith('-') ? suffix.slice(1).trim() : '';
  return {
    productId: `${productId}${suffix}`,
    ...(variantId ? { variantId } : {}),
    ...(typeof item.productName === 'string' ? { productName: item.productName } : {}),
    ...(Number.isSafeInteger(item.price) ? { price: item.price } : {}),
    quantity: item.quantity,
  };
}
