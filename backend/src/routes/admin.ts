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
      rushTimeAdjustment: Number(r.rush_time_adjustment_minutes) ?? 10,
      isPaused: Boolean(r.is_paused),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.patch('/settings', requireAdmin, async (req: Request, res: Response) => {
  try {
    const body = req.body as { defaultPreparationTime?: number; rushTimeAdjustment?: number; isPaused?: boolean };
    const updates: string[] = [];
    const params: unknown[] = [];
    if (typeof body.defaultPreparationTime === 'number') {
      updates.push('default_preparation_time_minutes = ?');
      params.push(body.defaultPreparationTime);
    }
    if (typeof body.rushTimeAdjustment === 'number') {
      updates.push('rush_time_adjustment_minutes = ?');
      params.push(body.rushTimeAdjustment);
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
      rushTimeAdjustment: Number(r.rush_time_adjustment_minutes) ?? 10,
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
    const { password } = req.body as { password?: string };
    const statsPassword = process.env.STATS_PASSWORD;
    if (!statsPassword || !password || password !== statsPassword) {
      res.status(401).json({ error: 'Felaktigt lösenord' });
      return;
    }

    // Per-produkt: sålda per dag/vecka/månad/år/totalt + intäkt
    const [productRows] = (await db.query(`
      SELECT
        oi.product_name_snapshot AS name,
        SUM(CASE WHEN DATE(o.created_at) = CURDATE() THEN oi.quantity ELSE 0 END) AS sold_day,
        SUM(CASE WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN oi.quantity ELSE 0 END) AS sold_week,
        SUM(CASE WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH) THEN oi.quantity ELSE 0 END) AS sold_month,
        SUM(CASE WHEN YEAR(o.created_at) = YEAR(NOW()) THEN oi.quantity ELSE 0 END) AS sold_year,
        SUM(oi.quantity) AS sold_total,
        SUM(CASE WHEN DATE(o.created_at) = CURDATE() THEN oi.price_ore * oi.quantity ELSE 0 END) AS revenue_day_ore,
        SUM(CASE WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN oi.price_ore * oi.quantity ELSE 0 END) AS revenue_week_ore,
        SUM(CASE WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH) THEN oi.price_ore * oi.quantity ELSE 0 END) AS revenue_month_ore,
        SUM(CASE WHEN YEAR(o.created_at) = YEAR(NOW()) THEN oi.price_ore * oi.quantity ELSE 0 END) AS revenue_year_ore,
        SUM(oi.price_ore * oi.quantity) AS revenue_total_ore
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.status NOT IN ('avbruten')
      GROUP BY oi.product_name_snapshot
      ORDER BY sold_total DESC
    `)) as [Row[], unknown];

    // Totaler per period
    const [totalRows] = (await db.query(`
      SELECT
        SUM(oi.quantity) AS items_total,
        SUM(CASE WHEN DATE(o.created_at) = CURDATE() THEN oi.quantity ELSE 0 END) AS items_day,
        SUM(CASE WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN oi.quantity ELSE 0 END) AS items_week,
        SUM(CASE WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH) THEN oi.quantity ELSE 0 END) AS items_month,
        SUM(CASE WHEN YEAR(o.created_at) = YEAR(NOW()) THEN oi.quantity ELSE 0 END) AS items_year,
        SUM(o.total_ore) AS revenue_total_ore,
        SUM(CASE WHEN DATE(o.created_at) = CURDATE() THEN o.total_ore ELSE 0 END) AS revenue_day_ore,
        SUM(CASE WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN o.total_ore ELSE 0 END) AS revenue_week_ore,
        SUM(CASE WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH) THEN o.total_ore ELSE 0 END) AS revenue_month_ore,
        SUM(CASE WHEN YEAR(o.created_at) = YEAR(NOW()) THEN o.total_ore ELSE 0 END) AS revenue_year_ore,
        COUNT(DISTINCT o.id) AS orders_total,
        SUM(CASE WHEN DATE(o.created_at) = CURDATE() THEN 1 ELSE 0 END) AS orders_day,
        SUM(CASE WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS orders_week,
        SUM(CASE WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH) THEN 1 ELSE 0 END) AS orders_month,
        SUM(CASE WHEN YEAR(o.created_at) = YEAR(NOW()) THEN 1 ELSE 0 END) AS orders_year
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.status NOT IN ('avbruten')
    `)) as [Row[], unknown];

    const totals = Array.isArray(totalRows) && totalRows[0] ? totalRows[0] as Row : {};
    const products = (Array.isArray(productRows) ? productRows : []) as Row[];

    res.json({
      products: products.map(p => ({
        name: p.name,
        soldDay: Number(p.sold_day) || 0,
        soldWeek: Number(p.sold_week) || 0,
        soldMonth: Number(p.sold_month) || 0,
        soldYear: Number(p.sold_year) || 0,
        soldTotal: Number(p.sold_total) || 0,
        revenueDayOre: Number(p.revenue_day_ore) || 0,
        revenueWeekOre: Number(p.revenue_week_ore) || 0,
        revenueMonthOre: Number(p.revenue_month_ore) || 0,
        revenueYearOre: Number(p.revenue_year_ore) || 0,
        revenueTotalOre: Number(p.revenue_total_ore) || 0,
      })),
      totals: {
        ordersDay: Number(totals.orders_day) || 0,
        ordersWeek: Number(totals.orders_week) || 0,
        ordersMonth: Number(totals.orders_month) || 0,
        ordersYear: Number(totals.orders_year) || 0,
        ordersTotal: Number(totals.orders_total) || 0,
        itemsDay: Number(totals.items_day) || 0,
        itemsWeek: Number(totals.items_week) || 0,
        itemsMonth: Number(totals.items_month) || 0,
        itemsYear: Number(totals.items_year) || 0,
        itemsTotal: Number(totals.items_total) || 0,
        revenueDayOre: Number(totals.revenue_day_ore) || 0,
        revenueWeekOre: Number(totals.revenue_week_ore) || 0,
        revenueMonthOre: Number(totals.revenue_month_ore) || 0,
        revenueYearOre: Number(totals.revenue_year_ore) || 0,
        revenueTotalOre: Number(totals.revenue_total_ore) || 0,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

export default router;
