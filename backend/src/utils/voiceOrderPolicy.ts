/** Owner-confirmed telephone rules. Not connected to live routes yet.
 * Prices, stock, opening hours and pause flags must come from current data.
 */
type ProductRule = {
  key: string;
  productId: string | null;
  name: string;
  serving: 'plate' | 'bread' | 'bread_only' | 'tray';
  filling: 'cheese' | 'ashta' | null;
  texture: 'ground' | 'crispy' | null;
  options: readonly {
    key: string;
    persons: number | null;
    catalogOption: string | null;
    countsAsLarge: boolean;
    /** Owner-confirmed setup data only. Never a runtime fallback for a missing DB price. */
    setupPriceOre?: number;
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
    key: 'crispy_ashta', productId: null,
    name: 'Krispig kunafa med ashta', serving: 'plate', filling: 'ashta', texture: 'crispy',
    options: [
      { key: 'small', persons: 3, catalogOption: null, countsAsLarge: false, setupPriceOre: 17900 },
      { key: 'large', persons: 6, catalogOption: null, countsAsLarge: true, setupPriceOre: 29900 },
    ],
  },
  {
    // Price confirmed; filling, variant, product binding and preparation still need completion.
    key: 'large_tray', productId: null,
    name: 'Bricka för 20–25 personer', serving: 'tray', filling: null, texture: null,
    options: [{ key: 'tray', persons: null, catalogOption: null, countsAsLarge: false, setupPriceOre: 100000 }],
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
    const product = rule.productId ? byId.get(rule.productId) : undefined;
    return {
      ...rule,
      options: rule.options.map(rawOption => {
        // Setup prices belong to product provisioning, not the agent's live catalog.
        const { setupPriceOre: _setupPriceOre, ...option } = rawOption as ProductRule['options'][number];
        const priceOre = product && product.hidden !== true
          ? currentPrice(product, option.catalogOption) : null;
        const catalogStatus = !product ? 'product_missing'
          : product.hidden === true ? 'hidden'
          : priceOre === null ? 'price_missing' : 'priced';
        return { ...option, priceOre, catalogStatus };
      }),
    };
  });
}

type VoiceProductKey = (typeof VOICE_PRODUCT_RULES)[number]['key'];
export type VoicePreparationLine = { productKey: VoiceProductKey; optionKey: string; quantity: number };

/** Only ordinary mapped kunafa/bread lines. Other products need explicit handling. */
export function voicePreparationMinutes(lines: readonly VoicePreparationLine[]): 15 | 20 {
  if (lines.length === 0) throw new Error('Beställningen saknar produkter.');
  let largeCount = 0;
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 100) {
      throw new Error('Ogiltigt antal.');
    }
    const rule = VOICE_PRODUCT_RULES.find(candidate => candidate.key === line.productKey);
    if (!rule) throw new Error('Okänd produkt.');
    if (rule.serving === 'tray') throw new Error('Tillagningstid för den stora brickan behöver fastställas.');
    const option = rule.options.find(candidate => candidate.key === line.optionKey);
    if (!option) throw new Error('Ogiltig storlek för produkten.');
    if (option.countsAsLarge) largeCount += line.quantity;
  }
  return largeCount > VOICE_ORDER_POLICY.largeOrderThresholdExclusive
    ? VOICE_ORDER_POLICY.largeOrderPreparationMinutes : VOICE_ORDER_POLICY.defaultPreparationMinutes;
}
