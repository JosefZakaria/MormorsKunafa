import { HOJA_LOCATION_ID } from '@mormors-kunafa/shared/types';
import { supabase, type Row, logSupabaseError } from './connection.js';
import { listLocations } from './locations.js';

type StockMap = Map<string, boolean>;

function stockKey(productId: string, locationId: string): string {
  return `${productId}:${locationId}`;
}

export function stockLocationIdForOrder(orderType: string, pickupLocationId: string | null): string {
  if (orderType === 'delivery') return HOJA_LOCATION_ID;
  return pickupLocationId ?? '';
}

export async function loadStockMap(): Promise<StockMap> {
  const { data, error } = await supabase
    .from('product_location_stock')
    .select('product_id, location_id, in_stock');

  if (error) {
    logSupabaseError('loadStockMap', error);
    throw error;
  }

  const map: StockMap = new Map();
  for (const row of data ?? []) {
    const r = row as Row;
    map.set(stockKey(String(r.product_id), String(r.location_id)), r.in_stock !== false);
  }
  return map;
}

export function stockByLocationForProduct(
  productId: string,
  locationIds: string[],
  stockMap: StockMap,
  fallbackInStock: boolean
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const locationId of locationIds) {
    result[locationId] = stockMap.has(stockKey(productId, locationId))
      ? Boolean(stockMap.get(stockKey(productId, locationId)))
      : fallbackInStock;
  }
  return result;
}

export function inStockAtLocation(
  productId: string,
  locationId: string,
  stockMap: StockMap,
  fallbackInStock: boolean
): boolean {
  if (!locationId) return fallbackInStock;
  if (!stockMap.has(stockKey(productId, locationId))) return fallbackInStock;
  return Boolean(stockMap.get(stockKey(productId, locationId)));
}

export async function setProductLocationStock(
  productId: string,
  locationId: string,
  inStock: boolean
): Promise<void> {
  const { error } = await supabase.from('product_location_stock').upsert(
    {
      product_id: productId,
      location_id: locationId,
      in_stock: inStock,
    },
    { onConflict: 'product_id,location_id' }
  );
  if (error) {
    logSupabaseError('setProductLocationStock', error);
    throw error;
  }
}

export async function seedProductLocationStock(productId: string, inStock: boolean): Promise<void> {
  const locations = await listLocations();
  if (locations.length === 0) return;
  const { error } = await supabase.from('product_location_stock').upsert(
    locations.map((location) => ({
      product_id: productId,
      location_id: location.id,
      in_stock: inStock,
    })),
    { onConflict: 'product_id,location_id' }
  );
  if (error) {
    logSupabaseError('seedProductLocationStock', error);
    throw error;
  }
}

export async function syncProductStockStatus(productId: string): Promise<void> {
  const { data, error } = await supabase
    .from('product_location_stock')
    .select('in_stock')
    .eq('product_id', productId);

  if (error) {
    logSupabaseError('syncProductStockStatus', error);
    throw error;
  }

  const anyInStock = (data ?? []).some((row) => (row as Row).in_stock !== false);
  const { error: updateError } = await supabase
    .from('products')
    .update({
      stock_status: anyInStock || (data ?? []).length === 0 ? 'instock' : 'outofstock',
    })
    .eq('id', productId);

  if (updateError) {
    logSupabaseError('syncProductStockStatus update', updateError);
    throw updateError;
  }
}

export async function outOfStockProductNames(
  productIds: string[],
  locationId: string
): Promise<string[]> {
  if (productIds.length === 0 || !locationId) return [];

  const { data: stockRows, error: stockError } = await supabase
    .from('product_location_stock')
    .select('product_id, in_stock')
    .eq('location_id', locationId)
    .in('product_id', productIds);

  if (stockError) {
    logSupabaseError('outOfStockProductNames', stockError);
    throw stockError;
  }

  const stock = new Map(
    (stockRows ?? []).map((row) => [String((row as Row).product_id), (row as Row).in_stock !== false])
  );

  const missing = productIds.filter((id) => stock.has(id) && stock.get(id) === false);
  if (missing.length === 0) return [];

  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, name, stock_status')
    .in('id', missing);

  if (productsError) {
    logSupabaseError('outOfStockProductNames products', productsError);
    throw productsError;
  }

  return (products ?? []).map((row) => String((row as Row).name ?? 'En vara'));
}
