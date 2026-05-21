import type { Product } from '@shared/types';
import { getTranslationIndex } from './productDisplayName';

/** Translation indices that must not appear on the menu. */
export const EXCLUDED_MENU_INDICES = new Set(['4', '6']);

/** Variant prices in öre (option label → price). */
export const VARIANT_PRICES: Record<string, Record<string, number>> = {
    '1': {
        '250 gram': 8900,
        '500 gram': 17900,
        '1 kg': 34900,
    },
    '2': {
        '250 gram': 6900,
        '500 gram': 12900,
        '1 kg': 24900,
    },
    '3': {
        '2 personer': 14900,
        '4 personer': 24900,
    },
    '5': {
        '500 gram': 14900,
        '1 kg': 24900,
    },
    '7': {
        '250 gram': 7900,
        '500 gram': 14900,
        '1 kg': 24900,
    },
    '8': {
        '2 personer': 14900,
        '4 personer': 24900,
    },
    '11': {
        '250 gram': 7900,
        '500 gram': 14900,
        '1 kg': 24900,
    },
    '13': {
        '500 gram': 17900,
        '1 kg': 34900,
    },
};

/** Per-piece price for bread (index 9). */
export const BREAD_UNIT_PRICE_ORE = 1500;

/** Options shown in the menu modal per product index (bread uses +/- stepper). */
export const PRODUCT_OPTIONS: Record<string, string[]> = {
    '1': ['250 gram', '500 gram', '1 kg'],
    '2': ['250 gram', '500 gram', '1 kg'],
    '3': ['2 personer', '4 personer'],
    '5': ['500 gram', '1 kg'],
    '7': ['250 gram', '500 gram', '1 kg'],
    '8': ['2 personer', '4 personer'],
    '11': ['250 gram', '500 gram', '1 kg'],
    '13': ['500 gram', '1 kg'],
};

/** Cart/modifier label for bread quantity. */
export function formatBreadOption(quantity: number): string {
    return `${Math.max(1, quantity)} st`;
}

/** Fixed-weight products (use DB price, no variant map). */
export const FIXED_WEIGHT_BY_INDEX: Record<string, string> = {
    '12': '1 kg',
    '14': '1350 gram',
};

export type OptionSelectorType = 'weight' | 'persons' | 'bread' | 'fixed';

export function isMenuExcluded(product: Product): boolean {
    const idx = getTranslationIndex(product);
    if (idx && EXCLUDED_MENU_INDICES.has(idx)) return true;
    if (/harise\s*med\s*ashta/i.test(product.name)) return true;
    if (/kaake\s*med\s*kunafa/i.test(product.name)) return true;
    return false;
}

export function getFixedWeight(product: Product): string | null {
    const idx = getTranslationIndex(product);
    if (idx && FIXED_WEIGHT_BY_INDEX[idx]) return FIXED_WEIGHT_BY_INDEX[idx];
    return null;
}

export function hasVariantPricing(product: Product): boolean {
    const idx = getTranslationIndex(product);
    if (!idx) return false;
    if (getFixedWeight(product)) return false;
    return idx in VARIANT_PRICES || idx === '9';
}

export function getProductOptions(product: Product): string[] {
    const idx = getTranslationIndex(product);
    if (!idx || idx === '9') return [];
    return PRODUCT_OPTIONS[idx] ?? [];
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
    return getTranslationIndex(product) === '9';
}

/**
 * Unit price in öre for the selected option.
 * Returns null for fixed-price products (use product.price).
 */
export function getVariantPriceOre(product: Product, option: string): number | null {
    const idx = getTranslationIndex(product);
    if (!idx) return null;
    if (idx === '9') return BREAD_UNIT_PRICE_ORE;
    const map = VARIANT_PRICES[idx];
    if (!map) return null;
    return map[option] ?? null;
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
    const idx = getTranslationIndex(product);
    if (idx && VARIANT_PRICES[idx]) {
        const prices = Object.values(VARIANT_PRICES[idx]);
        if (prices.length > 0) return Math.min(...prices);
    }
    return product.price;
}
