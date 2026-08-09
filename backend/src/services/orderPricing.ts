import {
  getAllowedVariantIds,
  getCatalogVariantPriceOre,
  getFixedVariantId,
  isBreadProductId,
} from '../shared/constants/productPricing.js';
import { supabase, type Row, logSupabaseError } from '../db/connection.js';
import { sanitizeProductName } from '../utils/sanitizeProductName.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_LINE_ITEMS = 25;
const MAX_QUANTITY_PER_LINE = 50;
const MAX_TOTAL_QUANTITY = 50;
const MAX_UNIT_PRICE_ORE = 10_000_000;

export type OrderItemInput = {
  productId?: unknown;
  variantId?: unknown;
  quantity?: unknown;
};

export type ServerPricedOrderLine = {
  productId: string;
  productNameSnapshot: string;
  quantity: number;
  priceOre: number;
};

export class OrderValidationError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'OrderValidationError';
  }
}

function validateInputs(items: unknown): Array<{
  productId: string;
  variantId?: string;
  quantity: number;
}> {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_LINE_ITEMS) {
    throw new OrderValidationError(`Beställningen måste innehålla 1–${MAX_LINE_ITEMS} orderrader.`);
  }

  let totalQuantity = 0;
  const validated = items.map((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      throw new OrderValidationError(`Orderrad ${index + 1} är ogiltig.`);
    }
    const input = raw as OrderItemInput;
    const productId = typeof input.productId === 'string' ? input.productId.trim().toLowerCase() : '';
    const variantId = typeof input.variantId === 'string' ? input.variantId.trim() : undefined;
    const quantity = input.quantity;

    if (!UUID_PATTERN.test(productId)) {
      throw new OrderValidationError(`Orderrad ${index + 1} har ett ogiltigt produkt-ID.`);
    }
    if (!Number.isInteger(quantity) || Number(quantity) < 1 || Number(quantity) > MAX_QUANTITY_PER_LINE) {
      throw new OrderValidationError(
        `Antalet på orderrad ${index + 1} måste vara ett heltal mellan 1 och ${MAX_QUANTITY_PER_LINE}.`
      );
    }
    if (variantId && variantId.length > 40) {
      throw new OrderValidationError(`Variant-ID på orderrad ${index + 1} är för långt.`);
    }

    totalQuantity += Number(quantity);
    return { productId, variantId: variantId || undefined, quantity: Number(quantity) };
  });

  if (totalQuantity > MAX_TOTAL_QUANTITY) {
    throw new OrderValidationError(`En beställning får innehålla högst ${MAX_TOTAL_QUANTITY} produkter.`);
  }
  return validated;
}

export function priceValidatedProductRows(
  inputs: ReturnType<typeof validateInputs>,
  productRows: Row[]
): ServerPricedOrderLine[] {
  const rowsById = new Map(productRows.map((row) => [String(row.id).toLowerCase(), row]));

  return inputs.map((input) => {
    const product = rowsById.get(input.productId);
    if (!product) {
      throw new OrderValidationError('En eller flera produkter finns inte längre i menyn.', 409);
    }
    if (String(product.stock_status ?? '').toLowerCase() !== 'instock') {
      throw new OrderValidationError(`${String(product.name ?? 'Produkten')} är slut i lager.`, 409);
    }

    const databasePriceOre = Number(product.price_ore);
    if (!Number.isSafeInteger(databasePriceOre) || databasePriceOre <= 0 || databasePriceOre > MAX_UNIT_PRICE_ORE) {
      throw new OrderValidationError('En produkt har ett ogiltigt serverpris.', 409);
    }

    const allowedVariants = getAllowedVariantIds(input.productId);
    const fixedVariantId = getFixedVariantId(input.productId);
    const bread = isBreadProductId(input.productId);
    let priceOre = databasePriceOre;
    let snapshotSuffix = '';

    if (bread) {
      priceOre = getCatalogVariantPriceOre(input.productId) ?? databasePriceOre;
      snapshotSuffix = `${input.quantity} st`;
    } else if (allowedVariants.length > 0) {
      const variantPrice = getCatalogVariantPriceOre(input.productId, input.variantId);
      if (!input.variantId || variantPrice == null) {
        throw new OrderValidationError('Välj en giltig variant för produkten.');
      }
      priceOre = variantPrice;
      snapshotSuffix = input.variantId;
    } else if (fixedVariantId) {
      if (input.variantId !== fixedVariantId) {
        throw new OrderValidationError('Produktens fasta variant är ogiltig.');
      }
      snapshotSuffix = fixedVariantId;
    } else if (input.variantId) {
      throw new OrderValidationError('Produkten har inte den angivna varianten.');
    }

    const name = sanitizeProductName(String(product.name ?? ''));
    if (!name) throw new OrderValidationError('En produkt saknar ett giltigt namn.', 409);

    return {
      productId: input.productId,
      productNameSnapshot: snapshotSuffix ? `${name} - ${snapshotSuffix}` : name,
      quantity: input.quantity,
      priceOre,
    };
  });
}

export async function buildServerPricedOrderLines(items: unknown): Promise<ServerPricedOrderLine[]> {
  const inputs = validateInputs(items);
  const productIds = [...new Set(inputs.map((item) => item.productId))];
  const { data, error } = await supabase
    .from('products')
    .select('id, name, price_ore, stock_status')
    .in('id', productIds);

  if (error) {
    logSupabaseError('buildServerPricedOrderLines', error);
    throw new Error('Failed to load authoritative product data');
  }
  return priceValidatedProductRows(inputs, (data ?? []) as Row[]);
}
