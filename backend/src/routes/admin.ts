import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { supabase, type Row, logSupabaseError, nowIso } from '../db/connection.js';
import {
  clearAdminSessionCookies,
  createAdminSessionCookies,
  requireAdmin,
  revokeAdminSessions,
  signToken,
} from '../middleware/auth.js';
import {
  createRateLimiter,
  getTrustedClientIp,
  hashRateLimitIdentifier,
} from '../middleware/rateLimit.js';
import { isDeliveryFeeLineItem } from '../constants/deliveryFee.js';
import {
  disablePushSubscriptionById,
  listActivePushSubscriptions,
  upsertPushSubscription,
} from '../db/pushSubscriptionsRepository.js';
import { getRealtimeStatus, registerRealtimeClient } from '../services/realtimeEvents.js';
import { isWebPushConfigured } from '../services/pushNotifications.js';
import { validatePushSubscription } from '../utils/webPushSecurity.js';
import {
  AdminInputError,
  parseAdminLoginInput,
  parseOptionalBoolean,
  parsePreparationMinutes,
  parseStatisticsRange,
} from '../utils/adminInput.js';
import { verifyAdminPassword } from '../utils/adminPassword.js';
import { hasRealtimeCapacity } from '../utils/realtimeCapacity.js';
import { logUnexpectedError } from '../utils/safeErrorMetadata.js';

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 min window
  max: 10, // max 10 attempts
  message: 'För många inloggningsförsök. Försök igen om 15 minuter.',
  prefix: 'admin-login',
});

function safeCompareStrings(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const router = Router();

const COMPLETED_STATUSES = ['klar', 'uthämtad', 'levererad'] as const;

function getAuthenticatedAdmin(req: Request): { adminId: string; email?: string } | null {
  const admin = (req as Request & {
    admin?: { adminId?: string; email?: string };
  }).admin;
  return admin?.adminId ? { adminId: admin.adminId, email: admin.email } : null;
}

const pushSubscriptionLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  prefix: 'admin-push-subscriptions',
  keyGenerator: (req) => hashRateLimitIdentifier(
    getAuthenticatedAdmin(req)?.adminId ?? getTrustedClientIp(req)
  ),
});

function toStockholmDateString(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
}

function todayInStockholm(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
}

function daysAgoStockholm(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function startOfYearStockholm(): Date {
  const y = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Stockholm', year: 'numeric' });
  return new Date(`${y}-01-01T00:00:00`);
}

function inRange(createdAt: string, start: Date | null, end: Date | null): boolean {
  const t = new Date(createdAt).getTime();
  if (start && t < start.getTime()) return false;
  if (end && t >= end.getTime()) return false;
  return true;
}

router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = parseAdminLoginInput(req.body?.email, req.body?.password);

    const { data: user, error } = await supabase
      .from('admin_users')
      .select('id, email, password_hash, display_name, token_version, is_active')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      logSupabaseError('POST /admin/login', error);
      res.status(500).json({ error: 'Login failed' });
      return;
    }

    const ok = await verifyAdminPassword(
      password,
      user ? String((user as Row).password_hash ?? '') : undefined
    );
    if (!user || !ok || (user as Row).is_active !== true) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const { error: loginUpdateError } = await supabase
      .from('admin_users')
      .update({ last_login_at: nowIso() })
      .eq('id', (user as Row).id);

    if (loginUpdateError) {
      logSupabaseError('POST /admin/login last_login_at', loginUpdateError);
    }

    const token = signToken({
      adminId: String((user as Row).id),
      email: String((user as Row).email),
      tokenVersion: Number((user as Row).token_version),
    });
    const csrfToken = crypto.randomBytes(32).toString('base64url');
    res.setHeader('Set-Cookie', createAdminSessionCookies(token, csrfToken));
    res.json({
      admin: {
        id: (user as Row).id,
        email: (user as Row).email,
        name: String((user as Row).display_name ?? (user as Row).email),
      },
    });
  } catch (e) {
    if (e instanceof AdminInputError) {
      res.status(400).json({ error: e.message });
      return;
    }
    logUnexpectedError('POST /admin/login', e);
    res.status(500).json({ error: 'Login failed' });
  }
});

const eventsLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'För många realtidsanslutningar. Försök igen om en minut.',
  prefix: 'admin-events',
});

router.post('/logout', requireAdmin, async (req: Request, res: Response) => {
  res.setHeader('Set-Cookie', clearAdminSessionCookies());
  try {
    const admin = (req as Request & { admin: import('../middleware/auth.js').JwtPayload }).admin;
    const revoked = await revokeAdminSessions(admin);
    if (!revoked) {
      res.status(409).json({ error: 'Session was already revoked' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    logUnexpectedError('POST /admin/logout session revocation failed', error);
    res.status(503).json({ error: 'Could not revoke session' });
  }
});

router.get('/session', requireAdmin, (req: Request, res: Response) => {
  const admin = getAuthenticatedAdmin(req);
  if (!admin?.adminId || !admin.email) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  res.json({
    admin: {
      id: admin.adminId,
      email: admin.email,
      name: admin.email,
    },
  });
});

router.get('/events', eventsLimiter, requireAdmin, (req: Request, res: Response) => {
  const admin = (req as Request & { admin: { adminId: string } }).admin;
  if (!hasRealtimeCapacity(getRealtimeStatus(), admin.adminId)) {
    res.status(429).json({ error: 'Too many realtime connections' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'private, no-store, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const cleanup = registerRealtimeClient(admin.adminId, res);
  req.on('close', cleanup);
});

router.get('/notifications/health', requireAdmin, (_req: Request, res: Response) => {
  const status = getRealtimeStatus();
  res.json({
    ok: true,
    webPushConfigured: isWebPushConfigured(),
    realtime: status,
  });
});

router.get('/push-subscriptions', requireAdmin, async (req: Request, res: Response) => {
  const admin = getAuthenticatedAdmin(req);
  if (!admin?.adminId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const subscriptions = await listActivePushSubscriptions(admin.adminId);
  res.json(
    subscriptions.map((it) => ({
      id: it.id,
      endpoint: it.endpoint,
      deviceLabel: it.device_label,
      userAgent: it.user_agent,
      createdAt: it.created_at,
      updatedAt: it.updated_at,
      lastSuccessAt: it.last_success_at,
      lastFailureAt: it.last_failure_at,
      lastFailureReason: it.last_failure_reason,
    }))
  );
});

router.post('/push-subscriptions', requireAdmin, pushSubscriptionLimiter, async (req: Request, res: Response) => {
  const admin = getAuthenticatedAdmin(req);
  if (!admin?.adminId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const subscription = req.body?.subscription as
    | {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      }
    | undefined;
  const validated = validatePushSubscription({
    endpoint: subscription?.endpoint,
    p256dh: subscription?.keys?.p256dh,
    auth: subscription?.keys?.auth,
    deviceLabel: req.body?.deviceLabel,
    userAgent: req.headers['user-agent'],
  });

  if (!validated) {
    res.status(400).json({ error: 'Invalid subscription payload' });
    return;
  }

  const saved = await upsertPushSubscription({
    adminId: admin.adminId,
    ...validated,
  });

  if (!saved) {
    res.status(500).json({ error: 'Failed to save subscription' });
    return;
  }

  res.status(201).json({
    id: saved.id,
    endpoint: saved.endpoint,
    deviceLabel: saved.device_label,
    createdAt: saved.created_at,
    updatedAt: saved.updated_at,
  });
});

router.delete('/push-subscriptions/:id', requireAdmin, pushSubscriptionLimiter, async (req: Request, res: Response) => {
  const admin = getAuthenticatedAdmin(req);
  if (!admin?.adminId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const ok = await disablePushSubscriptionById(String(req.params.id), admin.adminId);
  if (!ok) {
    res.status(500).json({ error: 'Failed to disable subscription' });
    return;
  }

  res.status(204).send();
});

async function fetchAdminSettingsRow(): Promise<Row | null> {
  const { data, error } = await supabase.from('admin_settings').select('*').limit(1).maybeSingle();
  if (error) {
    logSupabaseError('admin_settings', error);
    throw error;
  }
  return data as Row | null;
}

router.get('/settings', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const r = await fetchAdminSettingsRow();
    if (!r) {
      res.status(404).json({ error: 'Settings not found' });
      return;
    }
    res.json({
      defaultPreparationTime: Number(r.default_preparation_time_minutes) ?? 30,
      isPaused: Boolean(r.is_paused),
    });
  } catch (e) {
    logUnexpectedError('GET /admin/settings', e);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.patch('/settings', requireAdmin, async (req: Request, res: Response) => {
  try {
    const body = req.body as { defaultPreparationTime?: unknown; isPaused?: unknown };
    const defaultPreparationTime = parsePreparationMinutes(body.defaultPreparationTime);
    const isPaused = parseOptionalBoolean(body.isPaused, 'Pausläge');
    if (defaultPreparationTime == null && isPaused == null) {
      res.status(400).json({ error: 'defaultPreparationTime or isPaused required' });
      return;
    }
    const patch: Record<string, unknown> = { updated_at: nowIso() };
    if (defaultPreparationTime != null) patch.default_preparation_time_minutes = defaultPreparationTime;
    if (isPaused != null) patch.is_paused = isPaused;

    if (Object.keys(patch).length > 1) {
      const settings = await fetchAdminSettingsRow();
      if (!settings?.id) {
        res.status(404).json({ error: 'Settings not found' });
        return;
      }
      const { error } = await supabase
        .from('admin_settings')
        .update(patch)
        .eq('id', settings.id);
      if (error) {
        logSupabaseError('PATCH /admin/settings', error);
        res.status(500).json({ error: 'Failed to update settings' });
        return;
      }
    }

    const r = await fetchAdminSettingsRow();
    if (!r) {
      res.status(500).json({ error: 'Settings not found' });
      return;
    }
    res.json({
      defaultPreparationTime: Number(r.default_preparation_time_minutes) ?? 30,
      isPaused: Boolean(r.is_paused),
    });
  } catch (e) {
    if (e instanceof AdminInputError) {
      res.status(400).json({ error: e.message });
      return;
    }
    logUnexpectedError('PATCH /admin/settings', e);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

router.get('/notifications', requireAdmin, async (_req: Request, res: Response) => {
  res.json([]);
});

router.patch('/notifications/:id/read', requireAdmin, async (_req: Request, res: Response) => {
  res.status(204).send();
});

router.post('/statistics', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { password, startDate: rawStartDate, endDate: rawEndDate } = req.body as {
      password?: string;
      startDate?: unknown;
      endDate?: unknown;
    };
    const statsPassword = process.env.STATS_PASSWORD;
    if (!statsPassword || !password || !safeCompareStrings(password, statsPassword)) {
      res.status(401).json({ error: 'Felaktigt lösenord' });
      return;
    }

    const { startDate, endDate } = parseStatisticsRange(rawStartDate, rawEndDate);
    const hasCustomRange = Boolean(startDate && endDate);
    const customStart = startDate ? new Date(`${startDate}T00:00:00`) : null;
    const customEnd = endDate
      ? new Date(new Date(`${endDate}T23:59:59`).getTime() + 1000)
      : null;

    const today = todayInStockholm();
    const weekStart = daysAgoStockholm(7);
    const monthStart = daysAgoStockholm(30);
    const yearStart = startOfYearStockholm();

    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name')
      .order('name', { ascending: true });

    if (productsError) {
      logSupabaseError('POST /admin/statistics products', productsError);
      res.status(500).json({ error: 'Failed to fetch statistics' });
      return;
    }

    const { data: lineRows, error: linesError } = await supabase
      .from('order_items')
      .select(
        'quantity, price_ore, product_id, product_name_snapshot, orders!inner(id, status, payment_status, created_at)'
      );

    if (linesError) {
      logSupabaseError('POST /admin/statistics order_items', linesError);
      res.status(500).json({ error: 'Failed to fetch statistics' });
      return;
    }

    const { data: allOrders, error: ordersError } = await supabase
      .from('orders')
      .select('id, status, payment_status, total_ore, created_at');

    if (ordersError) {
      logSupabaseError('POST /admin/statistics orders', ordersError);
      res.status(500).json({ error: 'Failed to fetch statistics' });
      return;
    }

    type ProductAgg = {
      name: string;
      soldDay: number;
      soldWeek: number;
      soldMonth: number;
      soldYear: number;
      soldTotal: number;
      soldCustom: number;
      revenueDayOre: number;
      revenueWeekOre: number;
      revenueMonthOre: number;
      revenueYearOre: number;
      revenueTotalOre: number;
      revenueCustomOre: number;
    };

    const aggByProduct = new Map<string, ProductAgg>();
    for (const p of products ?? []) {
      const name = String((p as Row).name);
      aggByProduct.set(String((p as Row).id), {
        name,
        soldDay: 0,
        soldWeek: 0,
        soldMonth: 0,
        soldYear: 0,
        soldTotal: 0,
        soldCustom: 0,
        revenueDayOre: 0,
        revenueWeekOre: 0,
        revenueMonthOre: 0,
        revenueYearOre: 0,
        revenueTotalOre: 0,
        revenueCustomOre: 0,
      });
      aggByProduct.set(name, aggByProduct.get(String((p as Row).id))!);
    }

    const bump = (agg: ProductAgg, qty: number, rev: number, createdAt: string) => {
      const dayStr = toStockholmDateString(createdAt);
      agg.soldTotal += qty;
      agg.revenueTotalOre += rev;
      if (dayStr === today) {
        agg.soldDay += qty;
        agg.revenueDayOre += rev;
      }
      if (new Date(createdAt) >= weekStart) {
        agg.soldWeek += qty;
        agg.revenueWeekOre += rev;
      }
      if (new Date(createdAt) >= monthStart) {
        agg.soldMonth += qty;
        agg.revenueMonthOre += rev;
      }
      if (new Date(createdAt) >= yearStart) {
        agg.soldYear += qty;
        agg.revenueYearOre += rev;
      }
      if (hasCustomRange && customStart && customEnd && inRange(createdAt, customStart, customEnd)) {
        agg.soldCustom += qty;
        agg.revenueCustomOre += rev;
      }
    };

    for (const row of lineRows ?? []) {
      const r = row as Row;
      const order = r.orders as Row | undefined;
      if (!order) continue;
      if (!COMPLETED_STATUSES.includes(order.status as (typeof COMPLETED_STATUSES)[number])) continue;
      if (order.payment_status !== 'paid') continue;

      const qty = Number(r.quantity ?? 0);
      const rev = Number(r.price_ore ?? 0) * qty;
      const createdAt = String(order.created_at);
      const productId = String(r.product_id ?? '');
      const snapshotName = String(r.product_name_snapshot ?? '');

      if (isDeliveryFeeLineItem({ productId: productId || null, productName: snapshotName })) {
        continue;
      }

      let agg = aggByProduct.get(productId) ?? aggByProduct.get(snapshotName);
      if (!agg) {
        agg = {
          name: snapshotName || 'Okänd produkt',
          soldDay: 0,
          soldWeek: 0,
          soldMonth: 0,
          soldYear: 0,
          soldTotal: 0,
          soldCustom: 0,
          revenueDayOre: 0,
          revenueWeekOre: 0,
          revenueMonthOre: 0,
          revenueYearOre: 0,
          revenueTotalOre: 0,
          revenueCustomOre: 0,
        };
        aggByProduct.set(snapshotName, agg);
      }
      bump(agg, qty, rev, createdAt);
    }

    const uniqueProducts = new Map<string, ProductAgg>();
    for (const p of products ?? []) {
      const id = String((p as Row).id);
      const agg = aggByProduct.get(id);
      if (agg) uniqueProducts.set(id, agg);
    }

    const totals = {
      ordersDay: 0,
      ordersWeek: 0,
      ordersMonth: 0,
      ordersYear: 0,
      ordersTotal: 0,
      ordersCustom: 0,
      ordersCancelledDay: 0,
      ordersCancelledWeek: 0,
      ordersCancelledMonth: 0,
      ordersCancelledYear: 0,
      ordersCancelledTotal: 0,
      ordersCancelledCustom: 0,
      itemsDay: 0,
      itemsWeek: 0,
      itemsMonth: 0,
      itemsYear: 0,
      itemsTotal: 0,
      itemsCustom: 0,
      revenueDayOre: 0,
      revenueWeekOre: 0,
      revenueMonthOre: 0,
      revenueYearOre: 0,
      revenueTotalOre: 0,
      revenueCustomOre: 0,
    };

    for (const row of lineRows ?? []) {
      const r = row as Row;
      const order = r.orders as Row | undefined;
      if (!order) continue;
      if (!COMPLETED_STATUSES.includes(order.status as (typeof COMPLETED_STATUSES)[number])) continue;
      if (order.payment_status !== 'paid') continue;
      const qty = Number(r.quantity ?? 0);
      const createdAt = String(order.created_at);
      totals.itemsTotal += qty;
      if (toStockholmDateString(createdAt) === today) totals.itemsDay += qty;
      if (new Date(createdAt) >= weekStart) totals.itemsWeek += qty;
      if (new Date(createdAt) >= monthStart) totals.itemsMonth += qty;
      if (new Date(createdAt) >= yearStart) totals.itemsYear += qty;
      if (hasCustomRange && customStart && customEnd && inRange(createdAt, customStart, customEnd)) {
        totals.itemsCustom += qty;
      }
    }

    for (const o of allOrders ?? []) {
      const order = o as Row;
      const createdAt = String(order.created_at);
      const isCompleted =
        COMPLETED_STATUSES.includes(order.status as (typeof COMPLETED_STATUSES)[number]) &&
        order.payment_status === 'paid';
      const isCancelled = order.status === 'avbruten';

      if (isCompleted) {
        totals.ordersTotal += 1;
        totals.revenueTotalOre += Number(order.total_ore ?? 0);
        if (toStockholmDateString(createdAt) === today) {
          totals.ordersDay += 1;
          totals.revenueDayOre += Number(order.total_ore ?? 0);
        }
        if (new Date(createdAt) >= weekStart) {
          totals.ordersWeek += 1;
          totals.revenueWeekOre += Number(order.total_ore ?? 0);
        }
        if (new Date(createdAt) >= monthStart) {
          totals.ordersMonth += 1;
          totals.revenueMonthOre += Number(order.total_ore ?? 0);
        }
        if (new Date(createdAt) >= yearStart) {
          totals.ordersYear += 1;
          totals.revenueYearOre += Number(order.total_ore ?? 0);
        }
        if (hasCustomRange && customStart && customEnd && inRange(createdAt, customStart, customEnd)) {
          totals.ordersCustom += 1;
          totals.revenueCustomOre += Number(order.total_ore ?? 0);
        }
      }

      if (isCancelled) {
        totals.ordersCancelledTotal += 1;
        if (toStockholmDateString(createdAt) === today) totals.ordersCancelledDay += 1;
        if (new Date(createdAt) >= weekStart) totals.ordersCancelledWeek += 1;
        if (new Date(createdAt) >= monthStart) totals.ordersCancelledMonth += 1;
        if (new Date(createdAt) >= yearStart) totals.ordersCancelledYear += 1;
        if (hasCustomRange && customStart && customEnd && inRange(createdAt, customStart, customEnd)) {
          totals.ordersCancelledCustom += 1;
        }
      }
    }

    res.json({
      products: Array.from(uniqueProducts.values()).map((p) => ({
        name: p.name,
        soldDay: p.soldDay,
        soldWeek: p.soldWeek,
        soldMonth: p.soldMonth,
        soldYear: p.soldYear,
        soldTotal: p.soldTotal,
        soldCustom: p.soldCustom,
        revenueDayOre: p.revenueDayOre,
        revenueWeekOre: p.revenueWeekOre,
        revenueMonthOre: p.revenueMonthOre,
        revenueYearOre: p.revenueYearOre,
        revenueTotalOre: p.revenueTotalOre,
        revenueCustomOre: p.revenueCustomOre,
      })),
      totals,
      hasCustomRange,
    });
  } catch (e) {
    if (e instanceof AdminInputError) {
      res.status(400).json({ error: e.message });
      return;
    }
    logUnexpectedError('POST /admin/statistics', e);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

export default router;
