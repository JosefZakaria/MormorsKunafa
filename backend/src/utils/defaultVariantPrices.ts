/** Fallback option → öre when `products.variant_prices` is still empty. */
export const DEFAULT_VARIANT_PRICES_BY_PRODUCT_ID: Record<string, Record<string, number>> = {
  '1ae3fd7a-0042-4220-b330-b27b3147a0a6': {
    '250 gram': 8900,
    '500 gram': 17900,
    '1 kg': 34900,
  },
  '054b4adf-4da3-42c0-aa9b-b939023aafad': {
    '250 gram': 6900,
    '500 gram': 12900,
    '1 kg': 24900,
  },
  '77048580-fd68-454d-b34b-395b351a96d4': {
    '2 personer': 14900,
    '4 personer': 24900,
  },
  'fc469599-82e8-4ea3-aa18-0436bc2a2afd': {
    '500 gram': 14900,
    '1 kg': 24900,
  },
  '6c1efa0e-149c-4259-9bd0-f85fd35f4b62': {
    '250 gram': 7900,
    '500 gram': 14900,
    '1 kg': 24900,
  },
  '37b8b656-2604-4ca6-9745-e0d6f52338c1': {
    '2 personer': 14900,
    '4 personer': 24900,
  },
  '856b591e-08b3-40ec-b505-cb3b143293bb': {
    st: 1500,
  },
  '94fd4a72-2685-4bc4-8813-0f5e5eaa4a1c': {
    '250 gram': 7900,
    '500 gram': 14900,
    '1 kg': 24900,
  },
  '6312f48a-b156-431b-9f6d-103cc30bc9f8': {
    '500 gram': 17900,
    '1 kg': 34900,
  },
};

export function defaultVariantPricesForProduct(productId: string): Record<string, number> | null {
  return DEFAULT_VARIANT_PRICES_BY_PRODUCT_ID[productId.toLowerCase()] ?? null;
}
