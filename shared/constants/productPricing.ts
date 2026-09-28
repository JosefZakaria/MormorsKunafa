/**
 * Temporary server-authoritative pricing catalog for the current menu variants.
 *
 * Product base prices still come from the database. Only variants that are
 * currently modelled in the web UI live here until variants are represented in
 * the database with stable IDs.
 */

export const PRODUCT_ID_TO_CATALOG_INDEX: Readonly<Record<string, string>> = {
  '1ae3fd7a-0042-4220-b330-b27b3147a0a6': '1',
  '054b4adf-4da3-42c0-aa9b-b939023aafad': '2',
  '77048580-fd68-454d-b34b-395b351a96d4': '3',
  'fc469599-82e8-4ea3-aa18-0436bc2a2afd': '5',
  '6c1efa0e-149c-4259-9bd0-f85fd35f4b62': '7',
  '37b8b656-2604-4ca6-9745-e0d6f52338c1': '8',
  '856b591e-08b3-40ec-b505-cb3b143293bb': '9',
  '94fd4a72-2685-4bc4-8813-0f5e5eaa4a1c': '11',
  'c005c8af-3f2e-401c-923f-7dac0f682cda': '12',
  '6312f48a-b156-431b-9f6d-103cc30bc9f8': '13',
  '9e6d210b-8637-4deb-889c-0726060288aa': '14',
};

/** Variant prices in öre (catalog index -> stable option label -> price). */
export const VARIANT_PRICES_ORE: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  '1': { '250 gram': 8900, '500 gram': 17900, '1 kg': 34900 },
  '2': { '250 gram': 6900, '500 gram': 12900, '1 kg': 24900 },
  '3': { '2 personer': 14900, '4 personer': 24900 },
  '5': { '500 gram': 14900, '1 kg': 24900 },
  '7': { '250 gram': 7900, '500 gram': 14900, '1 kg': 24900 },
  '8': { '2 personer': 14900, '4 personer': 24900 },
  '11': { '250 gram': 7900, '500 gram': 14900, '1 kg': 24900 },
  '13': { '500 gram': 17900, '1 kg': 34900 },
};

export const BREAD_CATALOG_INDEX = '9';
export const BREAD_UNIT_PRICE_ORE = 1500;

export const FIXED_VARIANT_LABELS: Readonly<Record<string, string>> = {
  '12': '1 kg',
  '14': '1350 gram',
};

export function getProductCatalogIndex(productId: string): string | null {
  return PRODUCT_ID_TO_CATALOG_INDEX[productId.trim().toLowerCase()] ?? null;
}

export function getAllowedVariantIds(productId: string): readonly string[] {
  const index = getProductCatalogIndex(productId);
  if (!index) return [];
  return Object.keys(VARIANT_PRICES_ORE[index] ?? {});
}

export function getFixedVariantId(productId: string): string | null {
  const index = getProductCatalogIndex(productId);
  return index ? FIXED_VARIANT_LABELS[index] ?? null : null;
}

export function isBreadProductId(productId: string): boolean {
  return getProductCatalogIndex(productId) === BREAD_CATALOG_INDEX;
}

/** Returns null when the product uses its database base price. */
export function getCatalogVariantPriceOre(productId: string, variantId?: string): number | null {
  const index = getProductCatalogIndex(productId);
  if (!index) return null;
  if (index === BREAD_CATALOG_INDEX) return BREAD_UNIT_PRICE_ORE;
  const prices = VARIANT_PRICES_ORE[index];
  if (!prices) return null;
  return variantId ? prices[variantId] ?? null : null;
}
