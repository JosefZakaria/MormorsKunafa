import type { Product } from '@shared/types';
import { getTranslationIndex } from './productDisplayName';

/** Translation indices that must not appear on the menu. */
export const EXCLUDED_MENU_INDICES = new Set(['4', '6']);

/** Fallback variant prices in öre (option label → price) when API has none. */
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

/** Fallback per-piece price for bread (index 9). */
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

export type OptionSelectorType = 'weight' | 'persons' | 'bread' | 'fixed' | 'none';

export type PricingMode = 'single' | 'weight' | 'persons' | 'bread';

export const WEIGHT_PRESETS = ['250 gram', '500 gram', '1 kg', '1350 gram'] as const;

export const MAX_VARIANT_OPTIONS = 10;

export type EditablePriceField = { key: string; label: string; ore: number };

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

/** Option → öre from the product (admin-saved) or built-in fallback. */
export function getVariantPriceMap(product: Product): Record<string, number> | null {
    if (getFixedWeight(product)) return null;
    const stored = product.variantPrices;
    if (stored && Object.keys(stored).length > 0) return stored;
    const idx = getTranslationIndex(product);
    if (!idx) return null;
    if (idx === '9') return { st: product.price || BREAD_UNIT_PRICE_ORE };
    return VARIANT_PRICES[idx] ?? null;
}

export function hasVariantPricing(product: Product): boolean {
    if (getFixedWeight(product)) return false;
    if (isBreadProduct(product)) return true;
    const map = getVariantPriceMap(product);
    if (map && Object.keys(map).some((key) => key !== 'st')) return true;
    const idx = getTranslationIndex(product);
    if (!idx) return false;
    return idx in VARIANT_PRICES;
}

export function formatPersonOption(count: number): string {
    return `${count} personer`;
}

export function parsePersonCount(option: string): number | null {
    const m = option.trim().match(/^(\d+)\s*personer$/i);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function optionSortValue(label: string): number {
    const persons = parsePersonCount(label);
    if (persons != null) return persons;
    const kg = label.trim().match(/^([\d.,]+)\s*kg$/i);
    if (kg) return parseFloat(kg[1].replace(',', '.')) * 1000;
    const gram = label.trim().match(/^([\d.,]+)\s*g(?:ram)?$/i);
    if (gram) return parseFloat(gram[1].replace(',', '.'));
    return Number.POSITIVE_INFINITY;
}

export function sortOptionLabels(labels: string[]): string[] {
    return [...labels].sort((a, b) => {
        const da = optionSortValue(a);
        const db = optionSortValue(b);
        if (da === db) return 0;
        return da - db;
    });
}

export function nextWeightLabel(existing: string[]): string {
    const used = new Set(existing.map((s) => s.trim().toLowerCase()).filter(Boolean));
    return WEIGHT_PRESETS.find((preset) => !used.has(preset.toLowerCase())) ?? '';
}

export function nextPersonCount(existingCounts: number[]): number {
    const used = new Set(existingCounts);
    for (const n of [2, 4, 6, 8, 10, 12]) {
        if (!used.has(n)) return n;
    }
    const max = existingCounts.length ? Math.max(...existingCounts) : 0;
    return Math.max(1, max + 1);
}

export function getProductOptions(product: Product): string[] {
    if (isBreadProduct(product)) return [];
    const idx = getTranslationIndex(product);
    const canonical = idx ? PRODUCT_OPTIONS[idx] ?? [] : [];
    const map = getVariantPriceMap(product);
    const storedKeys = map ? Object.keys(map).filter((key) => key !== 'st') : [];
    if (!storedKeys.length) return canonical;
    const fromCanonical = canonical.filter((key) => storedKeys.includes(key));
    const extra = storedKeys.filter((key) => !canonical.includes(key));
    const ordered = fromCanonical.length || extra.length ? [...fromCanonical, ...extra] : canonical;
    return sortOptionLabels(ordered);
}

export function getOptionSelectorType(product: Product): OptionSelectorType {
    if (getFixedWeight(product)) return 'fixed';
    if (isBreadProduct(product)) return 'bread';
    const options = getProductOptions(product);
    if (options.some((opt) => /personer/i.test(opt))) return 'persons';
    const idx = getTranslationIndex(product);
    if (idx === '3' || idx === '8') return 'persons';
    if (options.length > 0 || hasVariantPricing(product)) return 'weight';
    return 'none';
}

export function inferPricingMode(product: Product): PricingMode {
    const type = getOptionSelectorType(product);
    if (type === 'bread') return 'bread';
    if (type === 'persons') return 'persons';
    if (type === 'weight') return 'weight';
    return 'single';
}

/** Parse bread option "3 st" → 3. */
export function parseBreadQuantity(option: string): number {
    const m = option.match(/^(\d+)\s*st$/i);
    return m ? Math.max(1, parseInt(m[1], 10)) : 1;
}

export function isBreadProduct(product: Product): boolean {
    if (getTranslationIndex(product) === '9') return true;
    const map = product.variantPrices;
    return Boolean(map && Object.keys(map).length === 1 && map.st != null);
}

export function getBreadUnitPriceOre(product: Product): number {
    const map = getVariantPriceMap(product);
    if (map?.st != null) return map.st;
    if (product.price > 0) return product.price;
    return BREAD_UNIT_PRICE_ORE;
}

/**
 * Unit price in öre for the selected option.
 * Returns null for fixed-price products (use product.price).
 */
export function getVariantPriceOre(product: Product, option: string): number | null {
    const map = getVariantPriceMap(product);
    if (!map) return null;
    if (isBreadProduct(product)) return getBreadUnitPriceOre(product);
    if (option && map[option] != null) return map[option];
    return null;
}

/** Display price in öre for bread by quantity. */
export function getBreadDisplayPriceOre(product: Product, quantity: number): number {
    return getBreadUnitPriceOre(product) * Math.max(1, quantity);
}

/** Display price in öre for modal (selected option or lowest variant / DB price). */
export function getDisplayPriceOre(product: Product, option: string, breadQuantity?: number): number {
    if (isBreadProduct(product)) {
        const qty = breadQuantity ?? (option ? parseBreadQuantity(option) : 1);
        return getBreadDisplayPriceOre(product, qty);
    }
    if (option) {
        const variant = getVariantPriceOre(product, option);
        if (variant != null) return variant;
    }
    const map = getVariantPriceMap(product);
    if (map) {
        const prices = Object.values(map).filter((n) => Number.isFinite(n));
        if (prices.length > 0) return Math.min(...prices);
    }
    return product.price;
}

/** Price fields shown in the admin edit form (empty = single price). */
export function getEditablePriceFields(product: Product): EditablePriceField[] {
    if (isBreadProduct(product)) {
        return [{ key: 'st', label: 'Per styck', ore: getBreadUnitPriceOre(product) }];
    }
    if (getFixedWeight(product)) return [];
    return getProductOptions(product).map((key) => ({
        key,
        label: key,
        ore: getVariantPriceOre(product, key) ?? 0,
    }));
}
