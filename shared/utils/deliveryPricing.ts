/** Delivery prices are stored in öre, just like product and order prices. */
export interface DeliveryCityFee {
  city: string;
  feeOre: number;
}

export interface DeliveryPricing {
  defaultFeeOre: number;
  cityFees: DeliveryCityFee[];
}

export interface DeliveryQuote {
  feeOre: number;
  matchedCity: string | null;
  showDeliveryEstimate: boolean;
}

/** Orders without a snapshot were placed under the previous national delivery terms. */
export function showOrderDeliveryEstimate(info?: { pricing?: DeliveryQuote }): boolean {
  return info?.pricing?.showDeliveryEstimate !== false;
}

/** Treat the client's quote only as acknowledgement, never as the source of the price. */
export function deliveryQuoteMatches(value: unknown, quote: DeliveryQuote): boolean {
  return isRecord(value) && value.feeOre === quote.feeOre &&
    value.matchedCity === quote.matchedCity && value.showDeliveryEstimate === quote.showDeliveryEstimate;
}

/** Initial settings only. Once configured, callers must use the saved settings. */
export const INITIAL_DELIVERY_PRICING: Readonly<{
  defaultFeeOre: number;
  cityFees: readonly Readonly<DeliveryCityFee>[];
}> = {
  defaultFeeOre: 7900,
  cityFees: [
    { city: 'Malmö', feeOre: 7900 },
    { city: 'Lund', feeOre: 11900 },
    { city: 'Burlöv', feeOre: 11900 },
    { city: 'Arlöv', feeOre: 11900 },
    { city: 'Helsingborg', feeOre: 14900 },
  ],
};

function cleanCity(city: string): string {
  return city.normalize('NFC').trim().replace(/\s+/g, ' ');
}

export function normalizeDeliveryCity(city: string): string {
  return cleanCity(city).toLocaleLowerCase('sv-SE');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseFee(value: unknown): number {
  // Match the database's non-negative PostgreSQL integer range. Zero is free delivery.
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 2147483647) {
    throw new Error('Leveransavgiften måste vara ett giltigt, icke-negativt heltal i öre.');
  }
  return value;
}

/** Validate admin input or stored settings. Never silently replace invalid prices. */
export function parseDeliveryPricing(value: unknown): DeliveryPricing {
  if (!isRecord(value) || !Array.isArray(value.cityFees)) {
    throw new Error('Ogiltiga leveransinställningar.');
  }
  const defaultFeeOre = parseFee(value.defaultFeeOre);
  const seen = new Set<string>();
  const cityFees = value.cityFees.map((entry): DeliveryCityFee => {
    if (!isRecord(entry) || typeof entry.city !== 'string' || !cleanCity(entry.city)) {
      throw new Error('Varje stadspris måste ha en ort.');
    }
    const city = cleanCity(entry.city);
    const key = normalizeDeliveryCity(city);
    if (seen.has(key)) {
      throw new Error(`Orten ${city} finns redan i leveransinställningarna.`);
    }
    seen.add(key);
    return { city, feeOre: parseFee(entry.feeOre) };
  });
  return { defaultFeeOre, cityFees };
}

/** Exact normalized city match; does not verify the address or postal code. */
export function quoteDelivery(city: string, pricing: DeliveryPricing): DeliveryQuote {
  const key = normalizeDeliveryCity(city);
  if (!key) throw new Error('Ange ort för att beräkna leveransavgiften.');
  const match = pricing.cityFees.find((entry) => normalizeDeliveryCity(entry.city) === key);
  return {
    feeOre: match ? match.feeOre : pricing.defaultFeeOre,
    matchedCity: match?.city ?? null,
    // A city's classification is independent of whether its price equals the default.
    showDeliveryEstimate: !match,
  };
}
