import { Router, Request, Response } from 'express';
import { supabase, generateId, type Row, logSupabaseError, nowIso } from '../db/connection.js';
import { getOrderById, getNextOrderNumber, updateOrder } from '../db/orderRepository.js';
import { orderRowToOrder, rowsToOrders } from '../db/ordersList.js';
import { requireAdmin } from '../middleware/auth.js';
import { PrinterService } from '../services/PrinterService.js';
import { sendOrderConfirmationEmail } from '../services/OrderConfirmationEmail.js';
import { sendSms } from '../services/SmsService.js';
import { getStripe } from '../services/stripeClient.js';
import { parseOrderScheduledAt } from '../utils/stockholmWallTime.js';
import {
  isAllowedPaymentMethod,
  isCardPayment,
  isOnlinePayment,
} from '../utils/paymentMethod.js';
import { resolveProductIdFromLineId } from '../utils/resolveProductId.js';
import {
  DELIVERY_FEE_ORE,
  DELIVERY_FEE_LINE_NAME,
  isDeliveryFeeLineItem,
} from '../constants/deliveryFee.js';
import { getPublicWebAppUrl } from '../utils/publicWebAppUrl.js';
import { confirmStripeCheckoutSession } from '../utils/confirmStripeCheckout.js';
import { sanitizeProductName } from '../utils/sanitizeProductName.js';
import swishPaymentRouter from './swishPayment.js';

const router = Router();

router.use('/swish-payment', swishPaymentRouter);

const ACTIVE_STATUSES = ['mottagen', 'påbörjad'] as const;

// Returns "YYYY-MM-DD" for the given date in the Europe/Stockholm timezone.
// Used because the Namecheap DB server is not in Swedish time and lacks
// timezone tables, so we can't rely on MySQL CURDATE()/DATE() for
// same-day-vs-future comparisons.
function toStockholmDateString(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
}

function todayInStockholm(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
}

// Create order (public)
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      items: Array<{ productId: string; productName: string; quantity: number; price: number; modifications?: string[] }>;
      orderType: string;
      customerInfo?: { name?: string; phone?: string; email?: string };
      deliveryInfo?: Record<string, string>;
      scheduledTime?: string;
      paymentMethod: string;
    };
    if (!body.items?.length) {
      res.status(400).json({ error: 'items required' });
      return;
    }

    const orderType = String(body.orderType ?? 'takeaway').trim();
    const isDelivery = orderType === 'delivery';
    const productItems = body.items.filter((it) => !isDeliveryFeeLineItem(it));
    if (!productItems.length) {
      res.status(400).json({ error: 'items required' });
      return;
    }
    if (isDelivery && !body.deliveryInfo) {
      res.status(400).json({ error: 'Leveransinformation krävs för hemleverans.' });
      return;
    }

    const paymentMethod = String(body.paymentMethod ?? 'cash').trim().toLowerCase();
    if (!isAllowedPaymentMethod(paymentMethod)) {
      res.status(400).json({ error: 'Invalid payment method' });
      return;
    }

    const orderNumber = await getNextOrderNumber();

    const { data: settingsRows, error: settingsError } = await supabase
      .from('admin_settings')
      .select('default_preparation_time_minutes, is_paused')
      .limit(1);

    if (settingsError) {
      logSupabaseError('POST /api/orders settings', settingsError);
      res.status(500).json({ error: 'Failed to fetch settings', details: settingsError.message });
      return;
    }

    const settings =
      Array.isArray(settingsRows) && settingsRows[0] ? (settingsRows[0] as Row) : null;
    
    if (settings && settings.is_paused) {
      res.status(403).json({ error: 'Beställningar är för tillfället pausade, försök igen senare.' });
      return;
    }

    const defaultPrep = settings
      ? Number(settings.default_preparation_time_minutes) || 30
      : 30;

    let scheduledAt: Date | null = null;
    if (body.scheduledTime != null && String(body.scheduledTime).trim() !== '') {
      scheduledAt = parseOrderScheduledAt(body.scheduledTime);
      if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
        res.status(400).json({ error: 'Ogiltig förbeställningstid. Välj datum och tid igen.' });
        return;
      }
    }
    const baseTime = scheduledAt && scheduledAt.getTime() > Date.now() ? scheduledAt : new Date();
    const estimatedReady = new Date(baseTime.getTime() + defaultPrep * 60 * 1000);

    const customerName = String(body.customerInfo?.name ?? body.deliveryInfo?.name ?? '').trim() || null;
    const customerEmail = String(body.customerInfo?.email ?? body.deliveryInfo?.email ?? '').trim() || null;
    const customerPhone = String(body.customerInfo?.phone ?? body.deliveryInfo?.phone ?? '').trim();

    if (!customerPhone) {
      res.status(400).json({ error: 'Telefonnummer krävs för beställning.' });
      return;
    }

    const orderId = generateId();
    const orderInsert = {
      id: orderId,
      order_number: orderNumber,
      status: 'ny',
      order_type: orderType,
      payment_method: paymentMethod,
      payment_status: 'pending',
      total_ore: 0,
      default_preparation_time_minutes: defaultPrep,
      estimated_ready_at: estimatedReady.toISOString(),
      scheduled_at: scheduledAt ? scheduledAt.toISOString() : null,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      delivery_info_json: body.deliveryInfo ?? null,
    };

    const { error: orderInsertError } = await supabase.from('orders').insert(orderInsert);
    if (orderInsertError) {
      logSupabaseError('POST /api/orders insert', orderInsertError);
      res.status(500).json({ error: 'Failed to create order', details: orderInsertError.message });
      return;
    }

    let totalOre = 0;
    const itemRows = [];
    for (const it of productItems) {
      const itemId = generateId();
      const lineTotal = (it.price ?? 0) * (it.quantity ?? 1);
      totalOre += lineTotal;
      itemRows.push({
        id: itemId,
        order_id: orderId,
        product_id: resolveProductIdFromLineId(it.productId),
        product_name_snapshot: sanitizeProductName(String(it.productName ?? '')),
        quantity: it.quantity ?? 1,
        price_ore: it.price ?? 0,
        modifications_json: it.modifications?.length ? it.modifications : null,
      });
    }

    if (isDelivery) {
      totalOre += DELIVERY_FEE_ORE;
      itemRows.push({
        id: generateId(),
        order_id: orderId,
        product_id: null,
        product_name_snapshot: DELIVERY_FEE_LINE_NAME,
        quantity: 1,
        price_ore: DELIVERY_FEE_ORE,
        modifications_json: null,
      });
    }

    const { error: itemsError } = await supabase.from('order_items').insert(itemRows);
    if (itemsError) {
      logSupabaseError('POST /api/orders items', itemsError);
      await supabase.from('orders').delete().eq('id', orderId);
      res.status(500).json({
        error: 'Kunde inte spara orderrader',
        details: itemsError.message,
      });
      return;
    }

    const { error: totalError } = await supabase
      .from('orders')
      .update({ total_ore: totalOre })
      .eq('id', orderId);

    if (totalError) {
      logSupabaseError('POST /api/orders total', totalError);
      res.status(500).json({ error: 'Failed to update order total', details: totalError.message });
      return;
    }

    const result = await getOrderById(orderId);
    if (!result) {
      res.status(500).json({ error: 'Order created but fetch failed' });
      return;
    }
    const emailOut = String(result.order.customer_email ?? '').trim();
    if (emailOut && !isOnlinePayment(paymentMethod)) {
      void sendOrderConfirmationEmail({ order: result.order, items: result.items }).catch((err) =>
        console.error('[order confirmation email]', err)
      );
    }

    const phoneOut = String(result.order.customer_phone ?? '').trim();
    const smsCustomerName = String(result.order.customer_name ?? '').trim();
    if (phoneOut && !isOnlinePayment(paymentMethod)) {
      void sendSms(phoneOut, `Tack för din beställning från Mormors Kunafa${smsCustomerName ? ', ' + smsCustomerName : ''}! Vi tar snart emot din beställning.`).catch((err) =>
        console.error('[order confirmation sms]', err)
      );
    }

    res.status(201).json(orderRowToOrder(result.order, result.items));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Stripe Checkout: start payment for an existing order (must be before GET /:id)
router.post('/checkout-session/:orderId', async (req: Request, res: Response) => {
  try {
    let stripe;
    try {
      stripe = getStripe();
    } catch {
      res.status(503).json({ error: 'Betalning är inte konfigurerad.' });
      return;
    }

    const orderId = req.params.orderId;
    const result = await getOrderById(orderId);
    if (!result) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const { order, items } = result;
    if (!isCardPayment(String(order.payment_method ?? ''))) {
      res.status(400).json({ error: 'Order does not use card payment' });
      return;
    }
    if (String(order.payment_status ?? '') !== 'pending') {
      res.status(400).json({ error: 'Order is not awaiting payment' });
      return;
    }

    const totalOre = Number(order.total_ore ?? 0);
    if (totalOre <= 0) {
      res.status(400).json({ error: 'Order has no payable total' });
      return;
    }

    const base = getPublicWebAppUrl();
    const successUrl = `${base}/status?orderId=${encodeURIComponent(orderId)}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${base}/cart`;
    console.info('[checkout-session] redirect base URL:', base);

    const lineItems = items.map((it) => {
      const name = String(it.product_name_snapshot ?? 'Product').slice(0, 500);
      const unitAmount = Number(it.price_ore ?? 0);
      const quantity = Math.max(1, Number(it.quantity ?? 1));
      return {
        quantity,
        price_data: {
          currency: 'sek',
          unit_amount: unitAmount,
          product_data: { name },
        },
      };
    });

    const custEmail = order.customer_email ? String(order.customer_email).trim() : '';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      ...(custEmail ? { customer_email: custEmail } : {}),
      line_items: lineItems,
      metadata: { orderId },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    const { error: stripeUpdateError } = await supabase
      .from('orders')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', orderId);

    if (stripeUpdateError) {
      logSupabaseError('checkout-session stripe id', stripeUpdateError);
      res.status(500).json({ error: 'Failed to save checkout session' });
      return;
    }

    if (!session.url) {
      res.status(500).json({ error: 'Checkout session missing URL' });
      return;
    }

    res.json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

/** Confirm card payment after Stripe redirect (backup when webhook is slow/missing). */
router.post('/stripe-confirm', async (req: Request, res: Response) => {
  try {
    const orderId = String(req.body?.orderId ?? '').trim();
    const sessionId = String(req.body?.sessionId ?? '').trim();
    if (!orderId || !sessionId) {
      res.status(400).json({ error: 'orderId and sessionId required' });
      return;
    }

    const outcome = await confirmStripeCheckoutSession(orderId, sessionId);
    if (!outcome.ok) {
      const status = outcome.error === 'Order not found' ? 404 : 400;
      res.status(status).json({ error: outcome.error ?? 'Could not confirm payment', paymentStatus: outcome.paymentStatus });
      return;
    }

    const result = await getOrderById(orderId);
    if (!result) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    res.json(orderRowToOrder(result.order, result.items));
  } catch (e) {
    console.error('[stripe-confirm]', e);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
});

// Admin routes must be before /:id so /admin/active is not matched as id=admin

// Admin: pending orders (status 'ny', waiting for acceptance).
// Excludes pre-orders scheduled for a future date (in Europe/Stockholm time).
router.get('/admin/pending', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'ny')
      .eq('payment_status', 'paid')
      .order('created_at', { ascending: true });

    if (error) {
      logSupabaseError('GET /admin/pending', error);
      res.status(500).json({ error: 'Failed to fetch pending orders', details: error.message });
      return;
    }

    const today = todayInStockholm();
    const sameDay = (data ?? []).filter((r) => {
      const schedDate = toStockholmDateString((r as Row).scheduled_at as Date | string | null);
      return schedDate == null || schedDate <= today;
    });
    res.json(await rowsToOrders(sameDay as Row[]));
  } catch (e) {
    console.error('[GET /admin/pending]', e);
    res.status(500).json({ error: 'Failed to fetch pending orders' });
  }
});

// Admin: accept order (ny → mottagen), optionally adjust estimated time
router.patch('/admin/:id/accept', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { extraMinutes } = req.body as { extraMinutes?: number };

    const result = await getOrderById(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    if (result.order.status !== 'ny') {
      res.status(400).json({ error: 'Order is not in pending state' });
      return;
    }

    const payMethod = String(result.order.payment_method ?? '');
    const payStatus = String(result.order.payment_status ?? '');
    if (isOnlinePayment(payMethod) && payStatus !== 'paid') {
      res.status(400).json({ error: 'Beställningen är inte betald ännu.' });
      return;
    }

    const defaultPrep = Number(result.order.default_preparation_time_minutes) || 30;
    const totalMinutes = defaultPrep + (extraMinutes ?? 0);
    const estimatedReady = new Date(Date.now() + totalMinutes * 60 * 1000);

    await updateOrder(req.params.id, {
      status: 'mottagen',
      estimated_ready_at: estimatedReady.toISOString(),
    });

    const updated = await getOrderById(req.params.id);
    if (!updated) {
      res.status(500).json({ error: 'Accept succeeded but fetch failed' });
      return;
    }

    const phoneOut = String(updated.order.customer_phone ?? '').trim();
    const customerName = String(updated.order.customer_name ?? '').trim();
    if (phoneOut) {
      const readyTimeStr = estimatedReady.toLocaleTimeString('sv-SE', {
        timeZone: 'Europe/Stockholm',
        hour: '2-digit',
        minute: '2-digit',
      });
      void sendSms(phoneOut, `Hej${customerName ? ', ' + customerName : ''}! Din order är mottagen och beräknas vara klar kl ${readyTimeStr}.`).catch((err) =>
        console.error('[order accepted sms]', err)
      );
    }

    const payload = orderRowToOrder(updated.order, updated.items);
    payload.estimatedReadyTime = estimatedReady.toISOString();
    res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to accept order' });
  }
});

// Admin: active orders
router.get('/admin/active', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .in('status', ['mottagen', 'påbörjad'])
      .eq('payment_status', 'paid')
      .order('created_at', { ascending: true });

    if (error) {
      logSupabaseError('GET /admin/active', error);
      res.status(500).json({ error: 'Failed to fetch active orders', details: error.message });
      return;
    }
    res.json(await rowsToOrders((data ?? []) as Row[]));
  } catch (e) {
    console.error('[GET /admin/active]', e);
    res.status(500).json({ error: 'Failed to fetch active orders' });
  }
});

// Admin: pre-orders (scheduled for a future date in Europe/Stockholm time).
// Includes both unaccepted ('ny') and accepted ('mottagen', 'påbörjad') pre-orders.
router.get('/admin/pre-orders', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .not('scheduled_at', 'is', null)
      .in('status', ['ny', 'mottagen', 'påbörjad'])
      .eq('payment_status', 'paid')
      .order('scheduled_at', { ascending: true });

    if (error) {
      logSupabaseError('GET /admin/pre-orders', error);
      res.status(500).json({ error: 'Failed to fetch pre-orders', details: error.message });
      return;
    }

    const today = todayInStockholm();
    const futureOnly = (data ?? []).filter((r) => {
      const schedDate = toStockholmDateString((r as Row).scheduled_at as Date | string | null);
      return schedDate != null && schedDate > today;
    });
    res.json(await rowsToOrders(futureOnly as Row[]));
  } catch (e) {
    console.error('[GET /admin/pre-orders]', e);
    res.status(500).json({ error: 'Failed to fetch pre-orders' });
  }
});

// Admin: history
router.get('/admin/history', requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const dateFrom = req.query.from as string | undefined;
    const dateTo = req.query.to as string | undefined;

    let query = supabase
      .from('orders')
      .select('*')
      .in('status', ['klar', 'avbruten', 'uthämtad', 'levererad'])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (dateFrom) {
      query = query.gte('created_at', `${dateFrom}T00:00:00.000Z`);
    }
    if (dateTo) {
      const end = new Date(`${dateTo}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      query = query.lt('created_at', end.toISOString());
    }

    const { data, error } = await query;
    if (error) {
      logSupabaseError('GET /admin/history', error);
      res.status(500).json({ error: 'Failed to fetch history', details: error.message });
      return;
    }
    res.json(await rowsToOrders((data ?? []) as Row[]));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Admin: delete all history (completed/cancelled orders only) — must be before :id route.
// Uses POST so a password can be supplied in the body.
router.post('/admin/history/all/delete', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { password } = req.body as { password?: string };
    const deletePassword = process.env.DELETE_PASSWORD;
    if (!deletePassword || !password || password !== deletePassword) {
      res.status(401).json({ error: 'Felaktigt lösenord' });
      return;
    }
    const { error } = await supabase
      .from('orders')
      .delete()
      .in('status', ['klar', 'avbruten', 'uthämtad', 'levererad']);

    if (error) {
      logSupabaseError('DELETE /admin/history/all', error);
      res.status(500).json({ error: 'Failed to clear history', details: error.message });
      return;
    }
    res.status(204).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

// Admin: delete single order. Uses POST so a password can be supplied in the body.
router.post('/admin/:id/delete', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { password } = req.body as { password?: string };
    const deletePassword = process.env.DELETE_PASSWORD;
    if (!deletePassword || !password || password !== deletePassword) {
      res.status(401).json({ error: 'Felaktigt lösenord' });
      return;
    }

    const { error } = await supabase.from('orders').delete().eq('id', req.params.id);
    if (error) {
      logSupabaseError('DELETE /admin/:id', error);
      res.status(500).json({ error: 'Failed to delete order', details: error.message });
      return;
    }
    res.status(204).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

// Admin: cancel order (password protected).
router.post('/admin/:id/cancel', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { password, cancellationReason } = req.body as { password?: string; cancellationReason?: string };
    const deletePassword = process.env.DELETE_PASSWORD;
    if (!deletePassword || !password || password !== deletePassword) {
      res.status(401).json({ error: 'Felaktigt lösenord' });
      return;
    }
    if (!cancellationReason || !cancellationReason.trim()) {
      res.status(400).json({ error: 'cancellationReason is required' });
      return;
    }

    const existing = await getOrderById(req.params.id);
    await updateOrder(req.params.id, {
      status: 'avbruten',
      cancelled_at: existing?.order.cancelled_at
        ? String(existing.order.cancelled_at)
        : nowIso(),
      cancellation_reason: cancellationReason.trim(),
    });

    const result = await getOrderById(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    res.json(orderRowToOrder(result.order, result.items));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// Admin: update status
router.patch('/admin/:id/status', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status, estimatedReadyTime, cancellationReason } = req.body as {
      status?: string;
      estimatedReadyTime?: string;
      cancellationReason?: string;
    };
    if (!status || !['ny', 'mottagen', 'påbörjad', 'klar', 'avbruten', 'uthämtad', 'levererad'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    if (status === 'avbruten' && (!cancellationReason || !cancellationReason.trim())) {
      res.status(400).json({ error: 'cancellationReason is required when status is avbruten' });
      return;
    }

    const existing = await getOrderById(req.params.id);
    const patch: Record<string, unknown> = { status };
    if (estimatedReadyTime) {
      patch.estimated_ready_at = new Date(estimatedReadyTime).toISOString();
    }
    if (status === 'påbörjad') {
      patch.started_at = existing?.order.started_at ? String(existing.order.started_at) : nowIso();
    }
    if (status === 'klar') {
      patch.completed_at = existing?.order.completed_at
        ? String(existing.order.completed_at)
        : nowIso();
    }
    if (status === 'avbruten') {
      patch.cancelled_at = existing?.order.cancelled_at
        ? String(existing.order.cancelled_at)
        : nowIso();
      patch.cancellation_reason = cancellationReason?.trim() ?? null;
    }
    await updateOrder(req.params.id, patch);

    const result = await getOrderById(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    if (status === 'klar') {
      const phoneOut = String(result.order.customer_phone ?? '').trim();
      const customerName = String(result.order.customer_name ?? '').trim();
      if (phoneOut) {
        void sendSms(phoneOut, `Hej${customerName ? ', ' + customerName : ''}! Din beställning från Mormors Kunafa är nu klar och redo att hämtas. Välkommen!`).catch((err) =>
          console.error('[order ready sms]', err)
        );
      }
    }

    res.json(orderRowToOrder(result.order, result.items));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Admin: update time
router.patch('/admin/:id/time', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { estimatedReadyTime, preparationTime } = req.body as { estimatedReadyTime?: string; preparationTime?: number };
    const patch: Record<string, unknown> = {};
    if (estimatedReadyTime) {
      patch.estimated_ready_at = new Date(estimatedReadyTime).toISOString();
    }
    if (typeof preparationTime === 'number') {
      patch.default_preparation_time_minutes = preparationTime;
    }
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'estimatedReadyTime or preparationTime required' });
      return;
    }
    await updateOrder(req.params.id, patch);

    const result = await getOrderById(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    res.json(orderRowToOrder(result.order, result.items));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update time' });
  }
});

// Admin: update internal notes
router.patch('/admin/:id/notes', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { internalNotes } = req.body as { internalNotes?: string };
    const trimmed = typeof internalNotes === 'string' ? internalNotes.trim() : '';
    await updateOrder(req.params.id, {
      internal_notes: trimmed.length > 0 ? trimmed : null,
    });

    const result = await getOrderById(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    res.json(orderRowToOrder(result.order, result.items));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update internal notes' });
  }
});

// Admin: print receipt
router.post('/admin/:id/print', requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await getOrderById(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    const orderData = orderRowToOrder(result.order, result.items);

    const printerIp = process.env.PRINTER_IP || '192.168.1.100';
    const printerService = new PrinterService(printerIp);
    
    const success = await printerService.printOrder(orderData);
    if (!success) {
      res.status(500).json({ error: 'Failed to print receipt' });
      return;
    }
    
    res.json({ success: true, message: 'Kvitto utskrivet' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to print receipt' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const result = await getOrderById(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    res.json(orderRowToOrder(result.order, result.items));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

export default router;
