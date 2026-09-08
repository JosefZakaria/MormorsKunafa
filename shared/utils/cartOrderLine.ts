/** Translate current and cached cart identifiers; the server resolves all prices. */
export function cartItemToOrderLine(item: { productId: string; quantity: number }) {
  const productId = item.productId.slice(0, 36).toLowerCase();
  const suffix = item.productId.slice(36);
  // A label such as "3 st" may be a real bundle. Only the server catalog can
  // distinguish that from the quantity label used by old per-piece carts.
  const variantId = suffix.startsWith('-') ? suffix.slice(1).trim() : '';
  return { productId, ...(variantId ? { variantId } : {}), quantity: item.quantity };
}
