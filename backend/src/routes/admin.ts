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

export default router;
