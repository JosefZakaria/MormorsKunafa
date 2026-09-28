import {
  getFixedVariantId,
  isBreadProductId,
} from '../shared/constants/productPricing.js';
import { supabase, type Row, logSupabaseError } from '../db/connection.js';
import { sanitizeProductName } from '../utils/sanitizeProductName.js';
import {
  parseVariantPricesInput,
  resolveLineOption,
  variantPricesForProduct,
} from '../utils/productPrices.js';
import { resolveProductIdFromLineId } from '../utils/resolveProductId.js';

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

export function validateOrderItemInputs(items: unknown): Array<{
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
    const lineProductId = typeof input.productId === 'string' ? input.productId.trim() : '';
    if (lineProductId.length > 117) {
      throw new OrderValidationError(`Orderrad ${index + 1} har ett för långt produkt-ID.`);
    }
    const productId = resolveProductIdFromLineId(lineProductId);
    const encodedVariantId = resolveLineOption(lineProductId) ?? undefined;
    const explicitVariantId = typeof input.variantId === 'string' ? input.variantId.trim() : undefined;
    const quantity = input.quantity;

    const suffix = productId ? lineProductId.slice(productId.length) : '';
    if (
      !productId
      || !UUID_PATTERN.test(productId)
      || (suffix !== '' && (!suffix.startsWith('-') || !encodedVariantId))
    ) {
      throw new OrderValidationError(`Orderrad ${index + 1} har ett ogiltigt produkt-ID.`);
    }
    if (!Number.isInteger(quantity) || Number(quantity) < 1 || Number(quantity) > MAX_QUANTITY_PER_LINE) {
      throw new OrderValidationError(
        `Antalet på orderrad ${index + 1} måste vara ett heltal mellan 1 och ${MAX_QUANTITY_PER_LINE}.`
      );
    }
    if ((encodedVariantId?.length ?? 0) > 80 || (explicitVariantId?.length ?? 0) > 80) {
      throw new OrderValidationError(`Variant-ID på orderrad ${index + 1} är för långt.`);
    }
    if (encodedVariantId && explicitVariantId && encodedVariantId !== explicitVariantId) {
      throw new OrderValidationError(`Orderrad ${index + 1} har motstridiga varianter.`);
    }
    const variantId = explicitVariantId || encodedVariantId;

    totalQuantity += Number(quantity);
    return { productId, variantId: variantId || undefined, quantity: Number(quantity) };
  });

  if (totalQuantity > MAX_TOTAL_QUANTITY) {
    throw new OrderValidationError(`En beställning får innehålla högst ${MAX_TOTAL_QUANTITY} produkter.`);
  }
  return validated;
}

export function priceValidatedProductRows(
  inputs: ReturnType<typeof validateOrderItemInputs>,
  productRows: Row[]
): ServerPricedOrderLine[] {
  const rowsById = new Map(productRows.map((row) => [String(row.id).toLowerCase(), row]));

  return inputs.map((input) => {
    const product = rowsById.get(input.productId);
    if (!product) {
      throw new OrderValidationError('En eller flera produkter finns inte längre i menyn.', 409);
    }
    if (product.hidden === true) throw new OrderValidationError('Produkten finns inte längre i menyn.', 409);
    if (String(product.stock_status ?? '').toLowerCase() !== 'instock') {
      throw new OrderValidationError(`${String(product.name ?? 'Produkten')} är slut i lager.`, 409);
    }

    const databasePriceOre = Number(product.price_ore);
    if (!Number.isSafeInteger(databasePriceOre) || databasePriceOre <= 0 || databasePriceOre > MAX_UNIT_PRICE_ORE) {
      throw new OrderValidationError('En produkt har ett ogiltigt serverpris.', 409);
    }

    if (product.variant_prices != null && parseVariantPricesInput(product.variant_prices) === 'invalid') {
      throw new OrderValidationError('Produktens variantpriser är ogiltiga.', 409);
    }
    const variants = variantPricesForProduct(input.productId, product.variant_prices);
    const fixedVariantId = getFixedVariantId(input.productId);
    const bread = isBreadProductId(input.productId)
      || (variants != null && Object.keys(variants).length === 1 && Object.hasOwn(variants, 'st'));
    let priceOre = databasePriceOre;
    let snapshotSuffix = '';

    if (bread) {
      // Legacy per-piece carts encoded their original quantity in the label.
      // Quantity edits do not change the unit price; actual bundle maps reach
      // the exact variant branch below instead of this catalog-confirmed mode.
      if (input.variantId && input.variantId !== 'st' && !/^\d+\s+st$/u.test(input.variantId)) {
        throw new OrderValidationError('Ogiltig brödvariant.');
      }
      priceOre = variants?.st ?? databasePriceOre;
      snapshotSuffix = `${input.quantity} st`;
    } else if (variants && Object.keys(variants).length > 0) {
      if (!input.variantId || !Object.hasOwn(variants, input.variantId)) {
        throw new OrderValidationError('Välj en giltig variant för produkten.');
      }
      priceOre = variants[input.variantId];
      snapshotSuffix = input.variantId;
    } else if (fixedVariantId) {
      if (input.variantId !== fixedVariantId) {
        throw new OrderValidationError('Produktens fasta variant är ogiltig.');
      }
      snapshotSuffix = fixedVariantId;
    } else if (input.variantId) {
      throw new OrderValidationError('Produkten har inte den angivna varianten.');
    }

    if (!Number.isSafeInteger(priceOre) || priceOre <= 0 || priceOre > MAX_UNIT_PRICE_ORE) {
      throw new OrderValidationError('Produktens variantpris är ogiltigt.', 409);
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
  const inputs = validateOrderItemInputs(items);
  const productIds = [...new Set(inputs.map((item) => item.productId))];
  const { data, error } = await supabase
    .from('products')
    .select('id, name, price_ore, variant_prices, stock_status, hidden')
    .in('id', productIds);

  if (error) {
    logSupabaseError('buildServerPricedOrderLines', error);
    throw new Error('Failed to load authoritative product data');
  }
  return priceValidatedProductRows(inputs, (data ?? []) as Row[]);
}
