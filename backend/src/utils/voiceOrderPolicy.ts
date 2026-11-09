/** Owner-confirmed telephone rules. Not connected to live routes yet.
 * Prices, stock, opening hours and pause flags must come from current data.
 */
import type { LocationSlug } from '@mormors-kunafa/shared/types';

type ProductRule = {
  key: string;
  productId: string;
  name: string;
  serving: 'plate' | 'bread' | 'bread_only' | 'tray';
  filling: 'cheese' | 'ashta' | null;
  texture: 'ground' | 'crispy' | null;
  /** This product can be offered by phone even while hidden from the web menu. */
  availableWhenHidden?: true;
  pickupLocationSlug?: LocationSlug;
  minimumLeadMinutes?: 120;
  freeCustomizations?: readonly string[];
  options: readonly {
    key: string;
    persons: number | null;
    catalogOption: string | null;
    countsAsLarge: boolean;
    texture?: 'ground' | 'crispy';
  }[];
};

export const VOICE_PRODUCT_RULES = [
  {
    key: 'ground_cheese', productId: '77048580-fd68-454d-b34b-395b351a96d4',
    name: 'Malen kunafa med ost', serving: 'plate', filling: 'cheese', texture: 'ground',
    options: [
      { key: 'small', persons: 2, catalogOption: '2 personer', countsAsLarge: false },
      { key: 'large', persons: 4, catalogOption: '4 personer', countsAsLarge: true },
    ],
  },
  {
    key: 'crispy_cheese', productId: '37b8b656-2604-4ca6-9745-e0d6f52338c1',
    name: 'Krispig kunafa med ost', serving: 'plate', filling: 'cheese', texture: 'crispy',
    options: [
      { key: 'small', persons: 2, catalogOption: '2 personer', countsAsLarge: false },
      { key: 'large', persons: 4, catalogOption: '4 personer', countsAsLarge: true },
    ],
  },
  {
    key: 'kunafa_in_bread', productId: '59ea8dfb-0d29-4792-bc24-5826cda4c09a',
    name: 'Kunafa i bröd', serving: 'bread', filling: 'cheese', texture: 'ground',
    options: [{ key: 'unit', persons: null, catalogOption: null, countsAsLarge: false }],
  },
  {
    key: 'bread_only', productId: '856b591e-08b3-40ec-b505-cb3b143293bb',
    name: 'Bara bröd (kake)', serving: 'bread_only', filling: null, texture: null,
    options: [{ key: 'unit', persons: null, catalogOption: 'st', countsAsLarge: false }],
  },
  {
    // Do not borrow the ID or prices of Ashta Baklawa or Mad bel Ashta.
    key: 'crispy_ashta', productId: 'd1671a64-2ae3-407a-b9cc-e417678f26f0', availableWhenHidden: true,
    name: 'Krispig kunafa med ashta', serving: 'plate', filling: 'ashta', texture: 'crispy',
    freeCustomizations: ['utan sirap', 'utan pistage'],
    options: [
      { key: 'small', persons: 3, catalogOption: '3 personer', countsAsLarge: false },
      { key: 'large', persons: 6, catalogOption: '6 personer', countsAsLarge: true },
    ],
  },
  {
    key: 'large_tray', productId: 'bf8ec400-450b-4726-bc58-d2b6a53a28a6', availableWhenHidden: true,
    name: 'Kunafabricka för 25 personer', serving: 'tray', filling: 'cheese', texture: null,
    pickupLocationSlug: 'hoja', minimumLeadMinutes: 120,
    freeCustomizations: ['extra ost', 'mindre ost', 'utan sirap', 'utan pistage'],
    options: [
      { key: 'ground', persons: 25, catalogOption: 'Malen med ost · 25 personer', texture: 'ground', countsAsLarge: false },
      { key: 'crispy', persons: 25, catalogOption: 'Krispig med ost · 25 personer', texture: 'crispy', countsAsLarge: false },
    ],
  },
] as const satisfies readonly ProductRule[];

export const VOICE_ORDER_POLICY = {
  defaultPreparationMinutes: 15,
  largeOrderPreparationMinutes: 20,
  largeOrderThresholdExclusive: 4,
  deliveryWebsite: 'https://mormorskunafa.se',
  specialOrderSms: '0728682592',
  askPickupTimeByDefault: false,
  mentionPricesOnlyWhenAsked: true,
} as const;

/** Raw database fields, before rowToProduct's legacy price fallbacks. */
export type VoiceCatalogProduct = {
  id: string;
  price_ore: unknown;
  variant_prices?: unknown;
  hidden?: boolean;
};

function validPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Explicitly missing prices remain missing; never use descriptions or old constants. */
function currentPrice(product: VoiceCatalogProduct, option: string | null): number | null {
  if (option === null) return validPrice(product.price_ore) ? product.price_ore : null;
  const variants = product.variant_prices;
  if (!variants || typeof variants !== 'object' || Array.isArray(variants)) return null;
  if (!Object.hasOwn(variants, option)) return null;
  const price = (variants as Record<string, unknown>)[option];
  return validPrice(price) ? price : null;
}

/** Catalog mapping only: a priced option is NOT a stock/opening-time approval. */
export function buildVoiceProductChoices(products: readonly VoiceCatalogProduct[]) {
  const byId = new Map(products.map(product => [product.id, product]));
  return VOICE_PRODUCT_RULES.map(rule => {
    const product = byId.get(rule.productId);
    const hiddenFromPhone = product?.hidden === true && !('availableWhenHidden' in rule);
    return {
      ...rule,
      options: rule.options.map(option => {
        const priceOre = product && !hiddenFromPhone
          ? currentPrice(product, option.catalogOption) : null;
        const catalogStatus = !product ? 'product_missing'
          : hiddenFromPhone ? 'hidden'
          : priceOre === null ? 'price_missing' : 'priced';
        return { ...option, priceOre, catalogStatus };
      }),
    };
  });
}

type VoiceProductKey = (typeof VOICE_PRODUCT_RULES)[number]['key'];
export type VoicePreparationLine = { productKey: VoiceProductKey; optionKey: string; quantity: number };

/** Minimum lead time for the mapped lines. Stock and opening hours are checked separately. */
export function voicePreparationMinutes(lines: readonly VoicePreparationLine[]): 15 | 20 | 120 {
  if (lines.length === 0) throw new Error('Beställningen saknar produkter.');
  let largeCount = 0;
  let minimumLeadMinutes: 0 | 120 = 0;
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 100) {
      throw new Error('Ogiltigt antal.');
    }
    const rule = VOICE_PRODUCT_RULES.find(candidate => candidate.key === line.productKey);
    if (!rule) throw new Error('Okänd produkt.');
    const option = rule.options.find(candidate => candidate.key === line.optionKey);
    if (!option) throw new Error('Ogiltig storlek för produkten.');
    if (option.countsAsLarge) largeCount += line.quantity;
    if ('minimumLeadMinutes' in rule) minimumLeadMinutes = rule.minimumLeadMinutes;
  }
  if (minimumLeadMinutes) return minimumLeadMinutes;
  return largeCount > VOICE_ORDER_POLICY.largeOrderThresholdExclusive
    ? VOICE_ORDER_POLICY.largeOrderPreparationMinutes : VOICE_ORDER_POLICY.defaultPreparationMinutes;
}
