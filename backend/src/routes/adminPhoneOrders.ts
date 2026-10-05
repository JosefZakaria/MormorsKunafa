import type { Request, Response, Router } from 'express';
import { supabase, generateId, logSupabaseError, type Row } from '../db/connection.js';
import { getLocationById, locationOrderTypeError } from '../db/locations.js';
import { inStockAtLocation, loadStockMap } from '../db/productLocationStock.js';
import { getNextOrderNumber, getOrderById } from '../db/orderRepository.js';
import { orderRowToOrder } from '../db/ordersList.js';
import { getRequestAdmin, requireAdmin } from '../middleware/auth.js';
import { dispatchOrderCreatedEvent } from '../services/realtimeEvents.js';
import { resolveProductIdFromLineId } from '../utils/resolveProductId.js';
import { resolveLineOption, resolveUnitPriceOre, variantPricesForProduct } from '../utils/productPrices.js';
import { sanitizeProductName } from '../utils/sanitizeProductName.js';
import { parsePhoneOrder, PhoneOrderError } from '../utils/phoneOrderInput.js';

async function createPhoneOrder(req: Request, res: Response): Promise<void> {
  let stagedOrderId: string | null = null;
  try {
    const admin = getRequestAdmin(req)!;
    const { data: account, error: accessError } = await supabase.from('admin_users')
      .select('role').eq('id', admin.adminId).maybeSingle();
    if (accessError) throw accessError;
    if (account?.role !== 'owner') {
      throw new PhoneOrderError(403, 'Endast huvudadministratören kan skapa telefonbeställningar.');
    }
    const body = parsePhoneOrder(req.body);
    const previous = await getOrderById(body.requestId);
    if (previous) {
      if (previous.order.payment_method !== 'pay_at_pickup') {
        throw new PhoneOrderError(409, 'Beställningen håller på att sparas. Försök igen om en stund.');
      }
      res.json(orderRowToOrder(previous.order, previous.items));
      return;
    }
    const [location, settingsResult, stock] = await Promise.all([
      getLocationById(body.locationId),
      supabase.from('admin_settings').select('is_paused, default_preparation_time_minutes').limit(1).maybeSingle(),
      loadStockMap(),
    ]);
    if (settingsResult.error) throw settingsResult.error;
    if (!location) throw new PhoneOrderError(400, 'Den valda lokalen finns inte.');
    const paused = locationOrderTypeError('takeaway', location);
    if (settingsResult.data?.is_paused || paused) throw new PhoneOrderError(403, paused || 'Beställningar är pausade.');
    const ids = [...new Set(body.items.map(item => resolveProductIdFromLineId(item.productId)))];
    if (ids.some(id => !id)) throw new PhoneOrderError(400, 'Ogiltig produkt.');
    const { data: products, error: productError } = await supabase.from('products')
      .select('id, name, price_ore, variant_prices, hidden, stock_status').in('id', ids as string[]);
    if (productError) throw productError;
    const catalog = new Map((products ?? []).map(product => [String(product.id), product as Row]));
    const itemRows = body.items.map(item => {
      const productId = resolveProductIdFromLineId(item.productId)!;
      const product = catalog.get(productId);
      if (!product || product.hidden === true) throw new PhoneOrderError(400, 'En vald produkt finns inte längre på menyn.');
      if (!inStockAtLocation(productId, location.id, stock, product.stock_status === 'instock')) {
        throw new PhoneOrderError(409, `${product.name} är slut i lager på ${location.name}.`);
      }
      const option = resolveLineOption(item.productId);
      const variants = variantPricesForProduct(productId, product.variant_prices);
      const choices = Object.keys(variants ?? {}).filter(key => key !== 'st');
      if ((option && variants?.[option] == null) || (choices.length && !option)) {
        throw new PhoneOrderError(400, `Välj en giltig storlek för ${product.name}.`);
      }
      const price = resolveUnitPriceOre(Number(product.price_ore), variants, option);
      if (!Number.isSafeInteger(price) || price < 0) throw new PhoneOrderError(400, 'Produkten har ett ogiltigt pris.');
      return {
        id: generateId(), order_id: body.requestId, product_id: productId,
        product_name_snapshot: sanitizeProductName(`${product.name}${option ? ` (${option})` : ''}`),
        quantity: item.quantity, price_ore: price, modifications_json: null,
      };
    });
    const total = itemRows.reduce((sum, item) => sum + item.quantity * item.price_ore, 0);
    const prep = Number(settingsResult.data?.default_preparation_time_minutes) || 30;
    const orderNumber = await getNextOrderNumber();
    const { error: insertError } = await supabase.from('orders').insert({
      id: body.requestId, order_number: orderNumber, status: 'ny', order_type: 'takeaway',
      // Keep the staging row outside the operational queues until all items are saved.
      payment_method: 'cash', payment_status: 'pending', total_ore: total,
      default_preparation_time_minutes: prep,
      estimated_ready_at: new Date(Date.now() + prep * 60000).toISOString(),
      scheduled_at: null, delivery_info_json: null, location_id: location.id,
      customer_name: `${body.customer.firstName} ${body.customer.lastName}`.trim(),
      customer_phone: body.customer.phone, customer_email: body.customer.email,
      internal_notes: body.notes || null,
    });
    if (insertError) {
      if (insertError.code === '23505') throw new PhoneOrderError(409, 'Beställningen håller på att sparas. Försök igen om en stund.');
      throw insertError;
    }
    stagedOrderId = body.requestId;
    const { error: itemsError } = await supabase.from('order_items').insert(itemRows);
    if (itemsError) throw itemsError;
    const { data: published, error: publishError } = await supabase.from('orders')
      .update({ payment_method: 'pay_at_pickup' }).eq('id', body.requestId).select('*').single();
    if (publishError) throw publishError;
    stagedOrderId = null;
    dispatchOrderCreatedEvent(body.requestId, orderNumber, 'takeaway', location.id, true);
    res.status(201).json(orderRowToOrder(published as Row, itemRows));
  } catch (error) {
    if (stagedOrderId) {
      const { error: cleanupError } = await supabase.from('orders').delete().eq('id', stagedOrderId).eq('payment_method', 'cash');
      if (cleanupError) logSupabaseError('phone order cleanup', cleanupError);
    }
    if (error instanceof PhoneOrderError) { res.status(error.status).json({ error: error.message }); return; }
    console.error('[admin phone order]', error);
    res.status(500).json({ error: 'Kunde inte spara telefonbeställningen. Försök igen.' });
  }
}

export function registerPhoneOrderRoutes(router: Router): void {
  router.post('/admin/phone-orders', requireAdmin, (req, res, next) => {
    void createPhoneOrder(req, res).catch(next);
  });
}
