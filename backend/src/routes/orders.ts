import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { supabase, generateId, type Row, logSupabaseError, nowIso } from '../db/connection.js';
import {
  compareAndUpdateOrder,
  createOrderAtomic,
  fetchOrderRow,
  getOrderById,
  updateOrder,
} from '../db/orderRepository.js';
import { orderRowToOrder, orderRowToPublicStatus, rowsToOrders } from '../db/ordersList.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  createRateLimiter,
  getTrustedClientIp,
  hashRateLimitIdentifier,
} from '../middleware/rateLimit.js';
import { PrinterService } from '../services/PrinterService.js';
import { sendOrderConfirmationEmail } from '../services/OrderConfirmationEmail.js';
import { sendSms } from '../services/SmsService.js';
import { getStripe, isStripeConfigured } from '../services/stripeClient.js';
import { parseOrderScheduledAt, formatStockholmDateTime } from '../utils/stockholmWallTime.js';
import { validateScheduledOrderTime } from '../shared/utils/openingHours.js';
import {
  isCardPayment,
  isOnlinePayment,
  isPublicPaymentMethodAvailable,
} from '../utils/paymentMethod.js';
import { isSwishConfigured } from '../services/swishClient.js';
import {
  DELIVERY_FEE_ORE,
  DELIVERY_FEE_LINE_NAME,
} from '../constants/deliveryFee.js';
import { getPublicWebAppUrl } from '../utils/publicWebAppUrl.js';
import { confirmStripeCheckoutSession } from '../utils/confirmStripeCheckout.js';
import swishPaymentRouter from './swishPayment.js';
import { isCanonicalUuidV4 } from '../utils/resourceId.js';
import {
  buildServerPricedOrderLines,
  OrderValidationError,
  type OrderItemInput,
} from '../services/orderPricing.js';
import {
  createOrderStatusToken,
  requireOrderStatusToken,
} from '../middleware/orderStatusToken.js';
import {
  CustomerInputError,
  sanitizeOperationalText,
  validateCustomerInput,
  validateScheduledTimeInput,
} from '../utils/customerInput.js';
import {
  canTransitionOrderStatus,
  canUseGeneralStatusRoute,
  isOrderStatus,
} from '../utils/orderStateMachine.js';
import {
  AdminInputError,
  parseDateOnly,
  parseEstimatedReadyTime,
  parseHistoryLimit,
  parseInternalNotes,
  parsePreparationMinutes,
} from '../utils/adminInput.js';
import { logUnexpectedError } from '../utils/safeErrorMetadata.js';
import {
  abandonOrderIdempotency,
  beginOrderIdempotency,
  completeOrderIdempotency,
  OrderIdempotencyError,
  type OrderIdempotencyContext,
} from '../middleware/orderIdempotency.js';

const orderLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 min window
  max: 15, // max 15 orders per IP per 15 minutes
  message: 'För många beställningsförsök. Vänta en stund och försök igen.',
  prefix: 'create-order',
});

const orderContactLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 8,
  message: 'För många beställningar med samma kontaktuppgifter. Försök igen senare.',
  prefix: 'create-order-contact',
  keyGenerator: (req) => {
    const phone = String(req.body?.customerInfo?.phone ?? req.body?.deliveryInfo?.phone ?? '');
    const email = String(req.body?.customerInfo?.email ?? req.body?.deliveryInfo?.email ?? '');
    return hashRateLimitIdentifier(`${getTrustedClientIp(req)}:${phone}:${email}`);
  },
});

function orderTokenRateKey(req: Request): string {
  const token = Array.isArray(req.headers['x-order-status-token'])
    ? req.headers['x-order-status-token'][0]
    : req.headers['x-order-status-token'];
  return hashRateLimitIdentifier(`${getTrustedClientIp(req)}:${token ?? 'missing'}`);
}

const checkoutLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  prefix: 'checkout-session',
  keyGenerator: orderTokenRateKey,
});

const paymentConfirmLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  prefix: 'payment-confirm',
  keyGenerator: orderTokenRateKey,
});

const orderStatusLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 180,
  prefix: 'order-status',
  keyGenerator: orderTokenRateKey,
});

function safeCompareStrings(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const router = Router();

for (const parameter of ['id', 'orderId']) {
  router.param(parameter, (req, res, next, value) => {
    if (!isCanonicalUuidV4(value)) {
      res.status(400).json({ error: 'Invalid resource identifier' });
      return;
    }
    next();
  });
}

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
router.post('/', orderLimiter, orderContactLimiter, async (req: Request, res: Response) => {
  let idempotencyContext: OrderIdempotencyContext | undefined;
  let orderPersisted = false;
  try {
    const body = req.body as {
      items: OrderItemInput[];
      orderType: string;
      customerInfo?: { name?: string; phone?: string; email?: string };
      deliveryInfo?: Record<string, string>;
      scheduledTime?: string;
      paymentMethod: string;
    };
    const orderType = String(body.orderType ?? 'takeaway').trim();
    const isDelivery = orderType === 'delivery';
    if (!['takeaway', 'eat-here', 'delivery'].includes(orderType)) {
      res.status(400).json({ error: 'Invalid order type' });
      return;
    }
    if (isDelivery && !body.deliveryInfo) {
      res.status(400).json({ error: 'Leveransinformation krävs för hemleverans.' });
      return;
    }

    const paymentMethod = String(body.paymentMethod ?? '').trim().toLowerCase();
    if (paymentMethod !== 'card' && paymentMethod !== 'swish') {
      res.status(400).json({ error: 'Invalid payment method' });
      return;
    }
    if (!isPublicPaymentMethodAvailable(paymentMethod, {
      stripe: isStripeConfigured(),
      swish: isSwishConfigured(),
    })) {
      res.status(503).json({ error: 'Den valda betalningsmetoden är inte tillgänglig.' });
      return;
    }

    const serverPricedLines = await buildServerPricedOrderLines(body.items);
    const scheduledTimeInput = validateScheduledTimeInput(body.scheduledTime);

    const { data: settingsRows, error: settingsError } = await supabase
      .from('admin_settings')
      .select('default_preparation_time_minutes, is_paused')
      .limit(1);

    if (settingsError) {
      logSupabaseError('POST /api/orders settings', settingsError);
      res.status(500).json({ error: 'Failed to fetch settings' });
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

    // Hemkörning has no customer-chosen time (1–2 business days); ignore any scheduledTime.
    let scheduledAt: Date | null = null;
    if (!isDelivery) {
      if (scheduledTimeInput) {
        scheduledAt = parseOrderScheduledAt(scheduledTimeInput);
        if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
          res.status(400).json({ error: 'Ogiltig förbeställningstid. Välj datum och tid igen.' });
          return;
        }
      }

      const hoursValidation = validateScheduledOrderTime(scheduledTimeInput, defaultPrep);
      if (!hoursValidation.valid) {
        res.status(400).json({ error: hoursValidation.error });
        return;
      }
    }

    const baseTime = scheduledAt && scheduledAt.getTime() > Date.now() ? scheduledAt : new Date();
    const estimatedReady = new Date(baseTime.getTime() + defaultPrep * 60 * 1000);

    const customer = validateCustomerInput(body.customerInfo, body.deliveryInfo, isDelivery);

    const idempotency = await beginOrderIdempotency(req.headers['idempotency-key'], body);
    if (idempotency.kind === 'replay') {
      res.setHeader('Idempotent-Replayed', 'true');
      res.status(201).json(idempotency.response);
      return;
    }
    if (idempotency.kind === 'processing') {
      res.setHeader('Retry-After', '5');
      res.status(409).json({ error: 'En identisk order behandlas redan. Försök igen om några sekunder.' });
      return;
    }
    if (idempotency.kind === 'conflict') {
      res.status(409).json({ error: 'Idempotency-Key has already been used for different order data' });
      return;
    }
    idempotencyContext = idempotency.context;

    const orderId = generateId();
    const statusAccess = createOrderStatusToken(orderId);
    const orderInsert = {
      id: orderId,
      status: 'ny',
      order_type: orderType,
      payment_method: paymentMethod,
      payment_status: 'pending',
      default_preparation_time_minutes: defaultPrep,
      estimated_ready_at: estimatedReady.toISOString(),
      scheduled_at: scheduledAt ? scheduledAt.toISOString() : null,
      customer_name: customer.customerName,
      customer_email: customer.customerEmail,
      customer_phone: customer.customerPhone,
      delivery_info_json: customer.deliveryInfo,
      order_status_token_hash: statusAccess.tokenHash,
      order_status_token_expires_at: statusAccess.expiresAt,
    };

    const itemRows: Array<{
      id: string;
      product_id: string | null;
      product_name_snapshot: string;
      quantity: number;
      price_ore: number;
      modifications_json: null;
    }> = serverPricedLines.map((line) => ({
      id: generateId(),
      product_id: line.productId,
      product_name_snapshot: line.productNameSnapshot,
      quantity: line.quantity,
      price_ore: line.priceOre,
      modifications_json: null,
    }));

    if (isDelivery) {
      itemRows.push({
        id: generateId(),
        product_id: null,
        product_name_snapshot: DELIVERY_FEE_LINE_NAME,
        quantity: 1,
        price_ore: DELIVERY_FEE_ORE,
        modifications_json: null,
      });
    }

    await createOrderAtomic(orderInsert, itemRows);
    orderPersisted = true;

    const result = await getOrderById(orderId);
    if (!result) {
      res.status(500).json({ error: 'Order created but fetch failed' });
      return;
    }
    const emailOut = String(result.order.customer_email ?? '').trim();
    if (emailOut && !isOnlinePayment(paymentMethod)) {
      void sendOrderConfirmationEmail({ order: result.order, items: result.items }).catch((err) =>
        logUnexpectedError('order confirmation email', err)
      );
    }

    const phoneOut = String(result.order.customer_phone ?? '').trim();
    const smsCustomerName = String(result.order.customer_name ?? '').trim();
    // Hemleverans får inga SMS – endast "Ta med" och "Äta här".
    if (phoneOut && !isOnlinePayment(paymentMethod) && !isDelivery) {
      const schedStr = result.order.scheduled_at ? formatStockholmDateTime(result.order.scheduled_at as string) : '';
      const schedSuffix = schedStr ? ` Planerad upphämtning: ${schedStr}.` : '';
      void sendSms(phoneOut, `Tack för din beställning från Mormors Kunafa${smsCustomerName ? ', ' + smsCustomerName : ''}! Vi tar snart emot din beställning.${schedSuffix}`).catch((err) =>
        logUnexpectedError('order confirmation sms', err)
      );
    }

    const responseBody = {
      ...orderRowToOrder(result.order, result.items),
      statusToken: statusAccess.token,
    };
    try {
      await completeOrderIdempotency(idempotencyContext, responseBody);
    } catch (error) {
      logUnexpectedError('order idempotency failed to persist completed response', error);
    }
    res.status(201).json(responseBody);
  } catch (e) {
    if (e instanceof OrderIdempotencyError) {
      res.status(400).json({ error: e.message });
      return;
    }
    if (e instanceof OrderValidationError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    if (e instanceof CustomerInputError) {
      res.status(400).json({ error: e.message });
      return;
    }
    logUnexpectedError('POST /api/orders', e);
    res.status(500).json({ error: 'Failed to create order' });
  } finally {
    // Keep the short processing lock after a persisted order fails so an
    // immediate retry cannot create a duplicate partial order.
    if (idempotencyContext && !orderPersisted) {
      try {
        await abandonOrderIdempotency(idempotencyContext);
      } catch (error) {
        logUnexpectedError('order idempotency cleanup', error);
      }
    }
  }
});

// Stripe Checkout: start payment for an existing order (must be before GET /:id)
router.post('/checkout-session/:orderId', checkoutLimiter, async (req: Request, res: Response) => {
  try {
    let stripe;
    try {
      stripe = getStripe();
    } catch {
      res.status(503).json({ error: 'Betalning är inte konfigurerad.' });
      return;
    }

    const orderId = req.params.orderId;
    if (!await requireOrderStatusToken(req, res, orderId)) return;
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
    if (!Number.isSafeInteger(totalOre) || totalOre <= 0) {
      res.status(400).json({ error: 'Order has no payable total' });
      return;
    }

    const storedSessionId = String(order.stripe_checkout_session_id ?? '').trim();
    if (storedSessionId) {
      const existingSession = await stripe.checkout.sessions.retrieve(storedSessionId);
      if (existingSession.status === 'open' && existingSession.url) {
        res.json({ url: existingSession.url });
        return;
      }
      if (existingSession.payment_status === 'paid') {
        res.status(409).json({ error: 'Order payment has already completed' });
        return;
      }
      if (existingSession.status !== 'expired') {
        res.status(409).json({ error: 'Order already has an active checkout session' });
        return;
      }
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

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        client_reference_id: orderId,
        ...(custEmail ? { customer_email: custEmail } : {}),
        line_items: lineItems,
        metadata: { orderId },
        success_url: successUrl,
        cancel_url: cancelUrl,
      },
      {
        // Concurrent retries for the same attempt receive the same Stripe object.
        idempotencyKey: `checkout-${orderId}-${storedSessionId || 'initial'}`,
      }
    );

    if (!session.url) {
      res.status(500).json({ error: 'Checkout session missing URL' });
      return;
    }

    const updateQuery = supabase
      .from('orders')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', orderId);
    const { data: updatedRows, error: stripeUpdateError } = storedSessionId
      ? await updateQuery.eq('stripe_checkout_session_id', storedSessionId).select('id')
      : await updateQuery.is('stripe_checkout_session_id', null).select('id');

    if (stripeUpdateError) {
      logSupabaseError('checkout-session stripe id', stripeUpdateError);
      res.status(500).json({ error: 'Failed to save checkout session' });
      return;
    }

    if (!updatedRows || updatedRows.length === 0) {
      const current = await getOrderById(orderId);
      if (String(current?.order.stripe_checkout_session_id ?? '') !== session.id) {
        res.status(409).json({ error: 'Checkout session changed; retry the request' });
        return;
      }
    }

    if (String(session.currency ?? '').toLowerCase() !== 'sek' || session.mode !== 'payment') {
      console.error('[checkout-session] Stripe returned unexpected session configuration');
      res.status(502).json({ error: 'Invalid checkout session configuration' });
      return;
    }

    res.json({ url: session.url });
  } catch (e) {
    logUnexpectedError('POST /api/orders/checkout-session/:orderId', e);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

/** Confirm card payment after Stripe redirect (backup when webhook is slow/missing). */
router.post('/stripe-confirm', paymentConfirmLimiter, async (req: Request, res: Response) => {
  try {
    const orderId = String(req.body?.orderId ?? '').trim();
    const sessionId = String(req.body?.sessionId ?? '').trim();
    if (!orderId || !sessionId) {
      res.status(400).json({ error: 'orderId and sessionId required' });
      return;
    }
    if (!await requireOrderStatusToken(req, res, orderId)) return;

    const outcome = await confirmStripeCheckoutSession(orderId, sessionId);
    if (!outcome.ok) {
      const status = outcome.error === 'Order not found' ? 404 : 400;
      res.status(status).json({ error: outcome.error ?? 'Could not confirm payment', paymentStatus: outcome.paymentStatus });
      return;
    }

    const order = await fetchOrderRow(orderId);
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(orderRowToPublicStatus(order));
  } catch (e) {
    logUnexpectedError('stripe confirm', e);
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
      res.status(500).json({ error: 'Failed to fetch pending orders' });
      return;
    }

    const today = todayInStockholm();
    const sameDay = (data ?? []).filter((r) => {
      const schedDate = toStockholmDateString((r as Row).scheduled_at as Date | string | null);
      return schedDate == null || schedDate <= today;
    });
    res.json(await rowsToOrders(sameDay as Row[]));
  } catch (e) {
    logUnexpectedError('GET /admin/pending', e);
    res.status(500).json({ error: 'Failed to fetch pending orders' });
  }
});

// Admin: accept order (ny → mottagen), optionally adjust estimated time
router.patch('/admin/:id/accept', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { extraMinutes } = req.body as { extraMinutes?: number };

    if (
      extraMinutes != null &&
      (!Number.isInteger(extraMinutes) || extraMinutes < 0 || extraMinutes > 180)
    ) {
      res.status(400).json({ error: 'extraMinutes must be an integer between 0 and 180' });
      return;
    }

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

    const accepted = await compareAndUpdateOrder(req.params.id, 'ny', {
      status: 'mottagen',
      estimated_ready_at: estimatedReady.toISOString(),
    });
    if (!accepted) {
      res.status(409).json({ error: 'Order status changed before it could be accepted' });
      return;
    }

    const updated = await getOrderById(req.params.id);
    if (!updated) {
      res.status(500).json({ error: 'Accept succeeded but fetch failed' });
      return;
    }

    const phoneOut = String(updated.order.customer_phone ?? '').trim();
    const customerName = String(updated.order.customer_name ?? '').trim();
    // Hemleverans får inga SMS – endast "Ta med" och "Äta här".
    if (phoneOut && String(updated.order.order_type ?? '') !== 'delivery') {
      const readyTimeStr = estimatedReady.toLocaleTimeString('sv-SE', {
        timeZone: 'Europe/Stockholm',
        hour: '2-digit',
        minute: '2-digit',
      });
      void sendSms(phoneOut, `Hej${customerName ? ', ' + customerName : ''}! Din order är mottagen och beräknas vara klar kl ${readyTimeStr}.`).catch((err) =>
        logUnexpectedError('order accepted sms', err)
      );
    }

    const payload = orderRowToOrder(updated.order, updated.items);
    payload.estimatedReadyTime = estimatedReady.toISOString();
    res.json(payload);
  } catch (e) {
    logUnexpectedError('POST /admin/:id/accept', e);
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
      res.status(500).json({ error: 'Failed to fetch active orders' });
      return;
    }
    res.json(await rowsToOrders((data ?? []) as Row[]));
  } catch (e) {
    logUnexpectedError('GET /admin/active', e);
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
      res.status(500).json({ error: 'Failed to fetch pre-orders' });
      return;
    }

    const today = todayInStockholm();
    const futureOnly = (data ?? []).filter((r) => {
      const schedDate = toStockholmDateString((r as Row).scheduled_at as Date | string | null);
      return schedDate != null && schedDate > today;
    });
    res.json(await rowsToOrders(futureOnly as Row[]));
  } catch (e) {
    logUnexpectedError('GET /admin/pre-orders', e);
    res.status(500).json({ error: 'Failed to fetch pre-orders' });
  }
});

// Admin: history
router.get('/admin/history', requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = parseHistoryLimit(req.query.limit);
    const dateFrom = parseDateOnly(req.query.from, 'Från-datum');
    const dateTo = parseDateOnly(req.query.to, 'Till-datum');

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
      res.status(500).json({ error: 'Failed to fetch history' });
      return;
    }
    res.json(await rowsToOrders((data ?? []) as Row[]));
  } catch (e) {
    if (e instanceof AdminInputError) {
      res.status(400).json({ error: e.message });
      return;
    }
    logUnexpectedError('GET /admin/history', e);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Admin: delete all history (completed/cancelled orders only) — must be before :id route.
// Uses POST so a password can be supplied in the body.
router.post('/admin/history/all/delete', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { password } = req.body as { password?: string };
    const deletePassword = process.env.DELETE_PASSWORD;
    if (!deletePassword || !password || !safeCompareStrings(password, deletePassword)) {
      res.status(401).json({ error: 'Felaktigt lösenord' });
      return;
    }
    const { error } = await supabase
      .from('orders')
      .delete()
      .in('status', ['klar', 'avbruten', 'uthämtad', 'levererad']);

    if (error) {
      logSupabaseError('DELETE /admin/history/all', error);
      res.status(500).json({ error: 'Failed to clear history' });
      return;
    }
    res.status(204).end();
  } catch (e) {
    logUnexpectedError('DELETE /admin/history', e);
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

// Admin: delete single order. Uses POST so a password can be supplied in the body.
router.post('/admin/:id/delete', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { password } = req.body as { password?: string };
    const deletePassword = process.env.DELETE_PASSWORD;
    if (!deletePassword || !password || !safeCompareStrings(password, deletePassword)) {
      res.status(401).json({ error: 'Felaktigt lösenord' });
      return;
    }

    const { error } = await supabase.from('orders').delete().eq('id', req.params.id);
    if (error) {
      logSupabaseError('DELETE /admin/:id', error);
      res.status(500).json({ error: 'Failed to delete order' });
      return;
    }
    res.status(204).end();
  } catch (e) {
    logUnexpectedError('DELETE /admin/:id', e);
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

// Admin: cancel order (password protected).
router.post('/admin/:id/cancel', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { password, cancellationReason } = req.body as { password?: string; cancellationReason?: string };
    const deletePassword = process.env.DELETE_PASSWORD;
    if (!deletePassword || !password || !safeCompareStrings(password, deletePassword)) {
      res.status(401).json({ error: 'Felaktigt lösenord' });
      return;
    }
    let reason: string;
    try {
      reason = sanitizeOperationalText(cancellationReason, 'Avbokningsorsak', 500);
    } catch (error) {
      if (error instanceof CustomerInputError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
    if (!reason) {
      res.status(400).json({ error: 'cancellationReason is required' });
      return;
    }

    const existing = await getOrderById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    const currentStatus = existing.order.status;
    if (!isOrderStatus(currentStatus) || !canTransitionOrderStatus(currentStatus, 'avbruten')) {
      res.status(409).json({ error: 'Order cannot be cancelled from its current status' });
      return;
    }
    if (
      isOnlinePayment(String(existing.order.payment_method ?? '')) &&
      String(existing.order.payment_status ?? '') === 'paid' &&
      String(existing.order.refund_status ?? 'none') !== 'refunded'
    ) {
      res.status(409).json({
        error: 'Provider refund must be completed before a paid online order can be cancelled',
      });
      return;
    }

    const cancelled = await compareAndUpdateOrder(req.params.id, currentStatus, {
      status: 'avbruten',
      cancelled_at: existing.order.cancelled_at
        ? String(existing.order.cancelled_at)
        : nowIso(),
      cancellation_reason: reason,
    });
    if (!cancelled) {
      res.status(409).json({ error: 'Order status changed before it could be cancelled' });
      return;
    }

    const result = await getOrderById(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    res.json(orderRowToOrder(result.order, result.items));
  } catch (e) {
    logUnexpectedError('POST /admin/:id/cancel', e);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

router.post('/admin/:id/revoke-status-token', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .update({
        order_status_token_hash: null,
        order_status_token_expires_at: null,
        updated_at: nowIso(),
      })
      .eq('id', req.params.id)
      .select('id')
      .maybeSingle();
    if (error) {
      logSupabaseError('POST /admin/:id/revoke-status-token', error);
      res.status(500).json({ error: 'Failed to revoke order status token' });
      return;
    }
    if (!data) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    logUnexpectedError('POST /admin/:id/revoke-status-token', error);
    res.status(500).json({ error: 'Failed to revoke order status token' });
  }
});

// Admin: update status
router.patch('/admin/:id/status', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status, estimatedReadyTime } = req.body as {
      status?: string;
      estimatedReadyTime?: string;
    };
    if (!isOrderStatus(status) || !canUseGeneralStatusRoute(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    const existing = await getOrderById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    const currentStatus = existing.order.status;
    if (!isOrderStatus(currentStatus) || !canTransitionOrderStatus(currentStatus, status)) {
      res.status(409).json({ error: 'Invalid order status transition' });
      return;
    }

    const patch: Record<string, unknown> = { status };
    const parsedReadyTime = parseEstimatedReadyTime(estimatedReadyTime);
    if (parsedReadyTime) patch.estimated_ready_at = parsedReadyTime;
    if (status === 'påbörjad') {
      patch.started_at = existing.order.started_at ? String(existing.order.started_at) : nowIso();
    }
    if (status === 'klar') {
      patch.completed_at = existing.order.completed_at
        ? String(existing.order.completed_at)
        : nowIso();
    }
    const updated = await compareAndUpdateOrder(req.params.id, currentStatus, patch);
    if (!updated) {
      res.status(409).json({ error: 'Order status changed before it could be updated' });
      return;
    }

    const result = await getOrderById(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    res.json(orderRowToOrder(result.order, result.items));
  } catch (e) {
    if (e instanceof AdminInputError) {
      res.status(400).json({ error: e.message });
      return;
    }
    logUnexpectedError('PATCH /admin/:id/status', e);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Admin: update time
router.patch('/admin/:id/time', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { estimatedReadyTime, preparationTime } = req.body as { estimatedReadyTime?: string; preparationTime?: number };
    const patch: Record<string, unknown> = {};
    const parsedReadyTime = parseEstimatedReadyTime(estimatedReadyTime);
    const parsedPreparationTime = parsePreparationMinutes(preparationTime);
    if (parsedReadyTime) patch.estimated_ready_at = parsedReadyTime;
    if (parsedPreparationTime != null) patch.default_preparation_time_minutes = parsedPreparationTime;
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
    if (e instanceof AdminInputError) {
      res.status(400).json({ error: e.message });
      return;
    }
    logUnexpectedError('PATCH /admin/:id/time', e);
    res.status(500).json({ error: 'Failed to update time' });
  }
});

// Admin: update internal notes
router.patch('/admin/:id/notes', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { internalNotes } = req.body as { internalNotes?: string };
    const notes = parseInternalNotes(internalNotes);
    await updateOrder(req.params.id, {
      internal_notes: notes,
    });

    const result = await getOrderById(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    res.json(orderRowToOrder(result.order, result.items));
  } catch (e) {
    if (e instanceof AdminInputError) {
      res.status(400).json({ error: e.message });
      return;
    }
    logUnexpectedError('PATCH /admin/:id/notes', e);
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
    logUnexpectedError('POST /admin/:id/print', e);
    res.status(500).json({ error: 'Failed to print receipt' });
  }
});

router.get('/settings', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('default_preparation_time_minutes, is_paused')
      .limit(1)
      .maybeSingle();

    if (error) {
      logSupabaseError('GET /api/orders/settings', error);
      res.status(500).json({ error: 'Failed to fetch settings' });
      return;
    }

    if (!data) {
      res.status(404).json({ error: 'Settings not found' });
      return;
    }

    res.json({
      defaultPreparationTime: Number(data.default_preparation_time_minutes) || 30,
      isPaused: Boolean(data.is_paused),
    });
  } catch (e) {
    logUnexpectedError('GET /api/orders/settings', e);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.get('/:id', orderStatusLimiter, async (req: Request, res: Response) => {
  try {
    if (!await requireOrderStatusToken(req, res, req.params.id)) return;
    const order = await fetchOrderRow(req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(orderRowToPublicStatus(order));
  } catch (e) {
    logUnexpectedError('GET /api/orders/:id', e);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

export default router;
