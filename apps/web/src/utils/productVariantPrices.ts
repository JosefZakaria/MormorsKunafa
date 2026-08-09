import type { Product } from '@shared/types';
import {
    BREAD_UNIT_PRICE_ORE,
    VARIANT_PRICES_ORE,
    getAllowedVariantIds,
    getCatalogVariantPriceOre,
    getFixedVariantId,
    getProductCatalogIndex,
    isBreadProductId,
} from '@shared/constants/productPricing';
import { getTranslationIndex } from './productDisplayName';

/** Translation indices that must not appear on the menu. */
export const EXCLUDED_MENU_INDICES = new Set(['4', '6']);

/** Variant prices in öre (option label → price). */
export { BREAD_UNIT_PRICE_ORE };

/** Cart/modifier label for bread quantity. */
export function formatBreadOption(quantity: number): string {
    return `${Math.max(1, quantity)} st`;
}

/** Fixed-weight products (use DB price, no variant map). */
export type OptionSelectorType = 'weight' | 'persons' | 'bread' | 'fixed';

export function isMenuExcluded(product: Product): boolean {
    const idx = getTranslationIndex(product);
    if (idx && EXCLUDED_MENU_INDICES.has(idx)) return true;
    if (/harise\s*med\s*ashta/i.test(product.name)) return true;
    if (/kaake\s*med\s*kunafa/i.test(product.name)) return true;
    return false;
}

export function getFixedWeight(product: Product): string | null {
    return getFixedVariantId(product.id);
}

export function hasVariantPricing(product: Product): boolean {
    const idx = getProductCatalogIndex(product.id);
    if (!idx) return false;
    if (getFixedWeight(product)) return false;
    return idx in VARIANT_PRICES_ORE || isBreadProductId(product.id);
}

export function getProductOptions(product: Product): string[] {
    if (isBreadProductId(product.id)) return [];
    return [...getAllowedVariantIds(product.id)];
}

export function getOptionSelectorType(product: Product): OptionSelectorType {
    const idx = getTranslationIndex(product);
    if (getFixedWeight(product)) return 'fixed';
    if (idx === '9') return 'bread';
    if (idx === '3' || idx === '8') return 'persons';
    return 'weight';
}

/** Parse bread option "3 st" → 3. */
export function parseBreadQuantity(option: string): number {
    const m = option.match(/^(\d+)\s*st$/i);
    return m ? Math.max(1, parseInt(m[1], 10)) : 1;
}

export function isBreadProduct(product: Product): boolean {
    return isBreadProductId(product.id);
}

/**
 * Unit price in öre for the selected option.
 * Returns null for fixed-price products (use product.price).
 */
export function getVariantPriceOre(product: Product, option: string): number | null {
    return getCatalogVariantPriceOre(product.id, option);
}

/** Display price in öre for bread by quantity. */
export function getBreadDisplayPriceOre(quantity: number): number {
    return BREAD_UNIT_PRICE_ORE * Math.max(1, quantity);
}

/** Display price in öre for modal (selected option or lowest variant / DB price). */
export function getDisplayPriceOre(product: Product, option: string, breadQuantity?: number): number {
    if (isBreadProduct(product)) {
        const qty = breadQuantity ?? (option ? parseBreadQuantity(option) : 1);
        return getBreadDisplayPriceOre(qty);
    }
    if (option) {
        const variant = getVariantPriceOre(product, option);
        if (variant != null) return variant;
    }
    const idx = getProductCatalogIndex(product.id);
    if (idx && VARIANT_PRICES_ORE[idx]) {
        const prices = Object.values(VARIANT_PRICES_ORE[idx]);
        if (prices.length > 0) return Math.min(...prices);
    }
    return product.price;
}
