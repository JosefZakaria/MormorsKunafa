import { defaultVariantPricesForProduct } from './defaultVariantPrices.js';
import { resolveProductIdFromLineId } from './resolveProductId.js';

const BREAD_OPTION_RE = /^(\d+)\s*st$/i;
const MAX_VARIANT_KEYS = 20;
const MAX_LABEL_LENGTH = 80;
const MAX_PRICE_ORE = 10_000_000;

export function parsePriceOre(value: unknown): number | null {
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    value = n;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const ore = Math.round(value);
  if (ore < 0 || ore > MAX_PRICE_ORE) return null;
  return ore;
}

/** Parse stored JSONB or request body into option → öre. Empty → null. */
export function parseVariantPrices(value: unknown): Record<string, number> | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (typeof value !== 'object' || Array.isArray(value)) return null;

  const out: Record<string, number> = {};
  for (const [rawKey, rawVal] of Object.entries(value as Record<string, unknown>)) {
    const label = rawKey.trim();
    if (!label || label.length > MAX_LABEL_LENGTH) continue;
    const ore = parsePriceOre(rawVal);
    if (ore == null) continue;
    out[label] = ore;
    if (Object.keys(out).length > MAX_VARIANT_KEYS) return null;
  }
  return Object.keys(out).length ? out : null;
}

export function parseVariantPricesInput(value: unknown): Record<string, number> | null | 'invalid' {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return 'invalid';
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_VARIANT_KEYS) return 'invalid';
  const out: Record<string, number> = {};
  for (const [rawKey, rawVal] of entries) {
    const label = String(rawKey ?? '').trim();
    if (!label || label.length > MAX_LABEL_LENGTH) return 'invalid';
    const ore = parsePriceOre(rawVal);
    if (ore == null) return 'invalid';
    out[label] = ore;
  }
  return Object.keys(out).length ? out : null;
}

export function resolveLineOption(lineProductId: string | undefined): string | null {
  const productId = resolveProductIdFromLineId(lineProductId);
  if (!productId) return null;
  const raw = String(lineProductId ?? '').trim();
  if (raw.length <= productId.length) return null;
  const rest = raw.slice(productId.length);
  if (!rest.startsWith('-')) return null;
  const option = rest.slice(1).trim();
  return option || null;
}

export function resolveUnitPriceOre(
  basePriceOre: number,
  variantPrices: Record<string, number> | null,
  option: string | null
): number {
  if (variantPrices) {
    if (option && variantPrices[option] != null) return variantPrices[option];
    if (option && BREAD_OPTION_RE.test(option) && variantPrices.st != null) return variantPrices.st;
    if (!option && variantPrices.st != null) return variantPrices.st;
  }
  return basePriceOre;
}

export function variantPricesForProduct(
  productId: string,
  stored: unknown
): Record<string, number> | null {
  return parseVariantPrices(stored) ?? defaultVariantPricesForProduct(productId);
}
