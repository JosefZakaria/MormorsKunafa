import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db, type Row } from '../db/connection.js';
import { requireAdmin, signToken } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' });
      return;
    }
    const [rows] = (await db.query(
      'SELECT id, email, password_hash, display_name FROM admin_users WHERE email = ?',
      [email]
    )) as [Row[], unknown];
    const list = Array.isArray(rows) ? rows : [];
    if (list.length === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const user = list[0] as Row;
    const ok = await bcrypt.compare(password, String(user.password_hash));
    if (!ok) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    await db.query('UPDATE admin_users SET last_login_at = NOW() WHERE id = ?', [user.id]);
    const token = signToken({ adminId: String(user.id), email: String(user.email) });
    res.json({
      token,
      admin: {
        id: user.id,
        email: user.email,
        name: String(user.display_name ?? user.email),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/settings', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [rows] = (await db.query('SELECT * FROM admin_settings LIMIT 1')) as [Row[], unknown];
    const r = Array.isArray(rows) && rows[0] ? (rows[0] as Row) : null;
    if (!r) {
      res.status(404).json({ error: 'Settings not found' });
      return;
    }
    res.json({
      defaultPreparationTime: Number(r.default_preparation_time_minutes) ?? 30,
      isPaused: Boolean(r.is_paused),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.patch('/settings', requireAdmin, async (req: Request, res: Response) => {
  try {
    const body = req.body as { defaultPreparationTime?: number; isPaused?: boolean };
    const updates: string[] = [];
    const params: unknown[] = [];
    if (typeof body.defaultPreparationTime === 'number') {
      updates.push('default_preparation_time_minutes = ?');
      params.push(body.defaultPreparationTime);
    }
    if (typeof body.isPaused === 'boolean') {
      updates.push('is_paused = ?');
      params.push(body.isPaused ? 1 : 0);
    }
    if (params.length > 0) {
      await db.query(`UPDATE admin_settings SET ${updates.join(', ')} WHERE id = 1`, params);
    }
    const [rows] = (await db.query('SELECT * FROM admin_settings LIMIT 1')) as [Row[], unknown];
    const r = Array.isArray(rows) && rows[0] ? (rows[0] as Row) : null;
    if (!r) {
      res.status(500).json({ error: 'Settings not found' });
      return;
    }
    res.json({
      defaultPreparationTime: Number(r.default_preparation_time_minutes) ?? 30,
      isPaused: Boolean(r.is_paused),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Notifications stub (return empty until F.Notis is implemented)
router.get('/notifications', requireAdmin, async (_req: Request, res: Response) => {
  res.json([]);
});

router.patch('/notifications/:id/read', requireAdmin, async (_req: Request, res: Response) => {
  res.status(204).send();
});

// Statistics (extra password protected)
router.post('/statistics', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { password, startDate, endDate } = req.body as { password?: string, startDate?: string, endDate?: string };
    const statsPassword = process.env.STATS_PASSWORD;
    if (!statsPassword || !password || password !== statsPassword) {
      res.status(401).json({ error: 'Felaktigt lösenord' });
      return;
    }

    const hasCustomRange = !!(startDate && endDate);
    const startStr = startDate ? `${startDate} 00:00:00` : null;
    const endStr = endDate ? `${endDate} 23:59:59` : null;

    // Per-produkt: alla produkter i menyn inkl. varianter, matcha pa id ELLER namn.
    // Endast genomforda ordrar raknas som forsaljning.
    const [productRows] = (await db.query(`
      SELECT
        p.name AS name,
        COALESCE(SUM(CASE WHEN o.id IS NOT NULL AND DATE(o.created_at) = CURDATE() THEN oi.quantity ELSE 0 END), 0) AS sold_day,
        COALESCE(SUM(CASE WHEN o.id IS NOT NULL AND o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN oi.quantity ELSE 0 END), 0) AS sold_week,
        COALESCE(SUM(CASE WHEN o.id IS NOT NULL AND o.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH) THEN oi.quantity ELSE 0 END), 0) AS sold_month,
        COALESCE(SUM(CASE WHEN o.id IS NOT NULL AND YEAR(o.created_at) = YEAR(NOW()) THEN oi.quantity ELSE 0 END), 0) AS sold_year,
        COALESCE(SUM(CASE WHEN o.id IS NOT NULL THEN oi.quantity ELSE 0 END), 0) AS sold_total,
        COALESCE(SUM(CASE WHEN o.id IS NOT NULL AND ? IS NOT NULL AND ? IS NOT NULL AND o.created_at BETWEEN ? AND ? THEN oi.quantity ELSE 0 END), 0) AS sold_custom,
        COALESCE(SUM(CASE WHEN o.id IS NOT NULL AND DATE(o.created_at) = CURDATE() THEN oi.price_ore * oi.quantity ELSE 0 END), 0) AS revenue_day_ore,
        COALESCE(SUM(CASE WHEN o.id IS NOT NULL AND o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN oi.price_ore * oi.quantity ELSE 0 END), 0) AS revenue_week_ore,
        COALESCE(SUM(CASE WHEN o.id IS NOT NULL AND o.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH) THEN oi.price_ore * oi.quantity ELSE 0 END), 0) AS revenue_month_ore,
        COALESCE(SUM(CASE WHEN o.id IS NOT NULL AND YEAR(o.created_at) = YEAR(NOW()) THEN oi.price_ore * oi.quantity ELSE 0 END), 0) AS revenue_year_ore,
        COALESCE(SUM(CASE WHEN o.id IS NOT NULL THEN oi.price_ore * oi.quantity ELSE 0 END), 0) AS revenue_total_ore,
        COALESCE(SUM(CASE WHEN o.id IS NOT NULL AND ? IS NOT NULL AND ? IS NOT NULL AND o.created_at BETWEEN ? AND ? THEN oi.price_ore * oi.quantity ELSE 0 END), 0) AS revenue_custom_ore
      FROM products p
      LEFT JOIN order_items oi ON (oi.product_id = p.id OR oi.product_name_snapshot = p.name)
      LEFT JOIN orders o ON o.id = oi.order_id AND o.status IN ('klar', 'uthämtad', 'levererad')
      GROUP BY p.id, p.name
      ORDER BY p.name ASC
    `, [startStr, endStr, startStr, endStr, startStr, endStr, startStr, endStr])) as [Row[], unknown];

    // Totaler per period - Items (kräver join)
    const [itemTotalRows] = (await db.query(`
      SELECT
        SUM(oi.quantity) AS items_total,
        SUM(CASE WHEN DATE(o.created_at) = CURDATE() THEN oi.quantity ELSE 0 END) AS items_day,
        SUM(CASE WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN oi.quantity ELSE 0 END) AS items_week,
        SUM(CASE WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH) THEN oi.quantity ELSE 0 END) AS items_month,
        SUM(CASE WHEN YEAR(o.created_at) = YEAR(NOW()) THEN oi.quantity ELSE 0 END) AS items_year,
        SUM(CASE WHEN ? IS NOT NULL AND ? IS NOT NULL AND o.created_at BETWEEN ? AND ? THEN oi.quantity ELSE 0 END) AS items_custom
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.status IN ('klar', 'uthämtad', 'levererad')
    `, [startStr, endStr, startStr, endStr])) as [Row[], unknown];

    // Totaler per period - Revenue, genomforda ordrar och avbrutna ordrar.
    const [orderTotalRows] = (await db.query(`
      SELECT
        SUM(CASE WHEN status IN ('klar', 'uthämtad', 'levererad') THEN 1 ELSE 0 END) AS orders_total,
        SUM(CASE WHEN status IN ('klar', 'uthämtad', 'levererad') AND DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS orders_day,
        SUM(CASE WHEN status IN ('klar', 'uthämtad', 'levererad') AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS orders_week,
        SUM(CASE WHEN status IN ('klar', 'uthämtad', 'levererad') AND created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH) THEN 1 ELSE 0 END) AS orders_month,
        SUM(CASE WHEN status IN ('klar', 'uthämtad', 'levererad') AND YEAR(created_at) = YEAR(NOW()) THEN 1 ELSE 0 END) AS orders_year,
        SUM(CASE WHEN status IN ('klar', 'uthämtad', 'levererad') AND ? IS NOT NULL AND ? IS NOT NULL AND created_at BETWEEN ? AND ? THEN 1 ELSE 0 END) AS orders_custom,
        SUM(CASE WHEN status = 'avbruten' THEN 1 ELSE 0 END) AS orders_cancelled_total,
        SUM(CASE WHEN status = 'avbruten' AND DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS orders_cancelled_day,
        SUM(CASE WHEN status = 'avbruten' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS orders_cancelled_week,
        SUM(CASE WHEN status = 'avbruten' AND created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH) THEN 1 ELSE 0 END) AS orders_cancelled_month,
        SUM(CASE WHEN status = 'avbruten' AND YEAR(created_at) = YEAR(NOW()) THEN 1 ELSE 0 END) AS orders_cancelled_year,
        SUM(CASE WHEN status = 'avbruten' AND ? IS NOT NULL AND ? IS NOT NULL AND created_at BETWEEN ? AND ? THEN 1 ELSE 0 END) AS orders_cancelled_custom,
        SUM(CASE WHEN status IN ('klar', 'uthämtad', 'levererad') THEN total_ore ELSE 0 END) AS revenue_total_ore,
        SUM(CASE WHEN status IN ('klar', 'uthämtad', 'levererad') AND DATE(created_at) = CURDATE() THEN total_ore ELSE 0 END) AS revenue_day_ore,
        SUM(CASE WHEN status IN ('klar', 'uthämtad', 'levererad') AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN total_ore ELSE 0 END) AS revenue_week_ore,
        SUM(CASE WHEN status IN ('klar', 'uthämtad', 'levererad') AND created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH) THEN total_ore ELSE 0 END) AS revenue_month_ore,
        SUM(CASE WHEN status IN ('klar', 'uthämtad', 'levererad') AND YEAR(created_at) = YEAR(NOW()) THEN total_ore ELSE 0 END) AS revenue_year_ore,
        SUM(CASE WHEN status IN ('klar', 'uthämtad', 'levererad') AND ? IS NOT NULL AND ? IS NOT NULL AND created_at BETWEEN ? AND ? THEN total_ore ELSE 0 END) AS revenue_custom_ore
      FROM orders
    `, [startStr, endStr, startStr, endStr, startStr, endStr, startStr, endStr, startStr, endStr, startStr, endStr])) as [Row[], unknown];

    const itemTotals = (itemTotalRows as Row[])[0] || {};
    const orderTotals = (orderTotalRows as Row[])[0] || {};
    const totals = { ...itemTotals, ...orderTotals };
    const products = (Array.isArray(productRows) ? productRows : []) as Row[];

    res.json({
      products: products.map(p => ({
        name: p.name,
        soldDay: Number(p.sold_day) || 0,
        soldWeek: Number(p.sold_week) || 0,
        soldMonth: Number(p.sold_month) || 0,
        soldYear: Number(p.sold_year) || 0,
        soldTotal: Number(p.sold_total) || 0,
        soldCustom: Number(p.sold_custom) || 0,
        revenueDayOre: Number(p.revenue_day_ore) || 0,
        revenueWeekOre: Number(p.revenue_week_ore) || 0,
        revenueMonthOre: Number(p.revenue_month_ore) || 0,
        revenueYearOre: Number(p.revenue_year_ore) || 0,
        revenueTotalOre: Number(p.revenue_total_ore) || 0,
        revenueCustomOre: Number(p.revenue_custom_ore) || 0,
      })),
      totals: {
        ordersDay: Number(totals.orders_day) || 0,
        ordersWeek: Number(totals.orders_week) || 0,
        ordersMonth: Number(totals.orders_month) || 0,
        ordersYear: Number(totals.orders_year) || 0,
        ordersTotal: Number(totals.orders_total) || 0,
        ordersCustom: Number(totals.orders_custom) || 0,
        ordersCancelledDay: Number(totals.orders_cancelled_day) || 0,
        ordersCancelledWeek: Number(totals.orders_cancelled_week) || 0,
        ordersCancelledMonth: Number(totals.orders_cancelled_month) || 0,
        ordersCancelledYear: Number(totals.orders_cancelled_year) || 0,
        ordersCancelledTotal: Number(totals.orders_cancelled_total) || 0,
        ordersCancelledCustom: Number(totals.orders_cancelled_custom) || 0,
        itemsDay: Number(totals.items_day) || 0,
        itemsWeek: Number(totals.items_week) || 0,
        itemsMonth: Number(totals.items_month) || 0,
        itemsYear: Number(totals.items_year) || 0,
        itemsTotal: Number(totals.items_total) || 0,
        itemsCustom: Number(totals.items_custom) || 0,
        revenueDayOre: Number(totals.revenue_day_ore) || 0,
        revenueWeekOre: Number(totals.revenue_week_ore) || 0,
        revenueMonthOre: Number(totals.revenue_month_ore) || 0,
        revenueYearOre: Number(totals.revenue_year_ore) || 0,
        revenueTotalOre: Number(totals.revenue_total_ore) || 0,
        revenueCustomOre: Number(totals.revenue_custom_ore) || 0,
      },
      hasCustomRange
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

export default router;
