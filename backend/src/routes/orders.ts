import { Router, Request, Response } from 'express';
import { db, generateId, type Row } from '../db/connection.js';
import { requireAdmin } from '../middleware/auth.js';
import { PrinterService } from '../services/PrinterService.js';

const router = Router();

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

// Statuses where stock has been "reserved" but not consumed yet. Canceling or
// deleting an order in one of these statuses should release the stock back to
// the counter.
const STOCK_RESERVED_STATUSES = new Set(['ny', 'mottagen', 'påbörjad']);

// Aggregate order items by productId (ignoring items without a productId).
function aggregateStockDemand(
  items: Array<{ productId?: string | null; productName?: string; quantity?: number }>
): Map<string, { name: string; qty: number }> {
  const map = new Map<string, { name: string; qty: number }>();
  for (const it of items) {
    const pid = it.productId;
    if (!pid) continue;
    const qty = Math.max(0, Math.floor(Number(it.quantity ?? 1)));
    if (qty <= 0) continue;
    const prev = map.get(pid);
    if (prev) prev.qty += qty;
    else map.set(pid, { name: it.productName ?? '', qty });
  }
  return map;
}

// Atomically reserves the required quantity for each tracked product.
// Products with stock_quantity = NULL are untracked and always succeed.
// Returns { ok: true } on success, or { ok: false, productName, available }
// on insufficient stock (in which case any partial reservations are rolled
// back before returning).
async function reserveStock(
  demand: Map<string, { name: string; qty: number }>
): Promise<{ ok: true } | { ok: false; productName: string; available: number }> {
  const reserved: Array<{ productId: string; qty: number }> = [];
  for (const [productId, info] of demand) {
    const [updateRes] = (await db.query(
      `UPDATE products
       SET stock_quantity = stock_quantity - ?, updated_at = NOW()
       WHERE id = ? AND stock_quantity IS NOT NULL AND stock_quantity >= ?`,
      [info.qty, productId, info.qty]
    )) as [{ affectedRows: number }, unknown];

    if (updateRes.affectedRows > 0) {
      reserved.push({ productId, qty: info.qty });
      continue;
    }

    // No rows affected: either product is untracked (stock_quantity NULL) or
    // there's not enough left. Check which case we're in.
    const [checkRows] = (await db.query(
      'SELECT name, stock_quantity FROM products WHERE id = ?',
      [productId]
    )) as [Row[], unknown];
    const check = Array.isArray(checkRows) && checkRows[0] ? (checkRows[0] as Row) : null;
    const currentQty = check?.stock_quantity;
    const currentName = (check?.name as string) ?? info.name;

    if (check == null) {
      // Product doesn't exist anymore; skip stock tracking for it.
      continue;
    }
    if (currentQty == null) {
      // Untracked product — no reservation needed.
      continue;
    }

    // Tracked but insufficient. Roll back everything we already reserved.
    for (const r of reserved) {
      await db.query(
        'UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = NOW() WHERE id = ? AND stock_quantity IS NOT NULL',
        [r.qty, r.productId]
      );
    }
    return { ok: false, productName: currentName, available: Number(currentQty) };
  }
  return { ok: true };
}

// Releases stock back to the counter for each order item (ignores untracked
// products automatically). Used when an order is cancelled or deleted while
// still in a "reserved" status.
async function releaseStockForItems(items: Row[]): Promise<void> {
  const demand = aggregateStockDemand(
    items.map((i) => ({
      productId: (i.product_id as string | null) ?? null,
      productName: (i.product_name_snapshot as string) ?? '',
      quantity: Number(i.quantity ?? 0),
    }))
  );
  for (const [productId, info] of demand) {
    await db.query(
      'UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = NOW() WHERE id = ? AND stock_quantity IS NOT NULL',
      [info.qty, productId]
    );
  }
}

function orderRowToOrder(r: Row, items: Row[]): Record<string, unknown> {
  const deliveryInfo = r.delivery_info_json != null
    ? (typeof r.delivery_info_json === 'string' ? JSON.parse(r.delivery_info_json as string) : r.delivery_info_json)
    : undefined;
  const customerInfo = (r.customer_name || r.customer_phone || r.customer_email)
    ? {
        name: (r.customer_name as string) ?? '',
        phone: (r.customer_phone as string) ?? '',
        ...(r.customer_email ? { email: r.customer_email as string } : {}),
      }
    : undefined;
  return {
    id: r.id,
    orderNumber: r.order_number,
    status: r.status,
    orderType: r.order_type,
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status,
    totalPrice: r.total_ore,
    defaultPreparationTime: r.default_preparation_time_minutes,
    estimatedReadyTime: (r.estimated_ready_at as Date)?.toISOString?.() ?? r.estimated_ready_at,
    scheduledTime: (r.scheduled_at as Date)?.toISOString?.() ?? r.scheduled_at,
    customerInfo,
    deliveryInfo,
    createdAt: (r.created_at as Date)?.toISOString?.() ?? r.created_at,
    updatedAt: (r.updated_at as Date)?.toISOString?.() ?? r.updated_at,
    startedAt: (r.started_at as Date)?.toISOString?.() ?? r.started_at,
    completedAt: (r.completed_at as Date)?.toISOString?.() ?? r.completed_at,
    cancellationReason: r.cancellation_reason ?? undefined,
    cancelledAt: (r.cancelled_at as Date)?.toISOString?.() ?? r.cancelled_at,
    refundStatus: r.refund_status ?? 'none',
    internalNotes: r.internal_notes ?? undefined,
    items: items.map((i) => ({
      productId: i.product_id ?? '',
      productName: i.product_name_snapshot,
      quantity: i.quantity,
      price: i.price_ore,
      modifications: i.modifications_json != null
        ? (typeof i.modifications_json === 'string' ? JSON.parse(i.modifications_json as string) : i.modifications_json)
        : undefined,
    })),
  };
}

async function getOrderById(id: string): Promise<{ order: Row; items: Row[] } | null> {
  const [orderRows] = (await db.query('SELECT * FROM orders WHERE id = ?', [id])) as [Row[], unknown];
  const orderList = Array.isArray(orderRows) ? orderRows : [];
  if (orderList.length === 0) return null;
  const [itemRows] = (await db.query('SELECT * FROM order_items WHERE order_id = ?', [id])) as [Row[], unknown];
  return { order: orderList[0], items: Array.isArray(itemRows) ? itemRows : [] };
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

    const [countResult] = (await db.query(
      "SELECT COALESCE(MAX(CAST(SUBSTRING(order_number, 2) AS UNSIGNED)), 0) + 1 AS n FROM orders WHERE order_number LIKE '#%'"
    )) as [Row[], unknown];
    const countRow = Array.isArray(countResult) && countResult[0] ? countResult[0] : null;
    const nextNum = (countRow as Row)?.n ?? 1;
    const orderNumber = `#${String(nextNum).padStart(4, '0')}`;

    const [settingsRows] = (await db.query('SELECT default_preparation_time_minutes, is_paused FROM admin_settings LIMIT 1')) as [Row[], unknown];
    const settings = Array.isArray(settingsRows) && settingsRows[0] ? (settingsRows[0] as Row) : null;
    
    if (settings && settings.is_paused) {
      res.status(403).json({ error: 'Beställningar är för tillfället pausade, försök igen senare.' });
      return;
    }

    const defaultPrep = settings
      ? Number(settings.default_preparation_time_minutes) || 30
      : 30;

    const scheduledAt = body.scheduledTime ? new Date(body.scheduledTime) : null;
    const baseTime = scheduledAt && scheduledAt.getTime() > Date.now() ? scheduledAt : new Date();
    const estimatedReady = new Date(baseTime.getTime() + defaultPrep * 60 * 1000);

    const customerName = body.customerInfo?.name ?? body.deliveryInfo?.name ?? null;
    const customerEmail = body.customerInfo?.email ?? body.deliveryInfo?.email ?? null;
    const customerPhone = body.customerInfo?.phone ?? body.deliveryInfo?.phone ?? null;

    // Reserve stock before inserting anything. If insufficient, fail fast
    // with a friendly 409 so the client can refresh its product list.
    const demand = aggregateStockDemand(body.items);
    const reservation = await reserveStock(demand);
    if (!reservation.ok) {
      res.status(409).json({
        error: `'${reservation.productName}' är slut i lager.`,
        productName: reservation.productName,
        available: reservation.available,
        outOfStock: true,
      });
      return;
    }

    const orderId = generateId();
    try {
      await db.query(
        `INSERT INTO orders (id, order_number, status, order_type, payment_method, payment_status, total_ore, default_preparation_time_minutes, estimated_ready_at, scheduled_at, customer_name, customer_email, customer_phone, delivery_info_json)
         VALUES (?, ?, 'ny', ?, ?, 'pending', 0, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          orderNumber,
          body.orderType ?? 'takeaway',
          body.paymentMethod ?? 'cash',
          defaultPrep,
          estimatedReady,
          scheduledAt,
          customerName,
          customerEmail,
          customerPhone,
          body.deliveryInfo ? JSON.stringify(body.deliveryInfo) : null,
        ]
      );

      let totalOre = 0;
      for (const it of body.items) {
        const itemId = generateId();
        const lineTotal = (it.price ?? 0) * (it.quantity ?? 1);
        totalOre += lineTotal;
        await db.query(
          `INSERT INTO order_items (id, order_id, product_id, product_name_snapshot, quantity, price_ore, modifications_json)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            itemId,
            orderId,
            it.productId || null,
            it.productName ?? '',
            it.quantity ?? 1,
            it.price ?? 0,
            it.modifications?.length ? JSON.stringify(it.modifications) : null,
          ]
        );
      }
      await db.query('UPDATE orders SET total_ore = ? WHERE id = ?', [totalOre, orderId]);

      const result = await getOrderById(orderId);
      if (!result) {
        res.status(500).json({ error: 'Order created but fetch failed' });
        return;
      }
      res.status(201).json(orderRowToOrder(result.order, result.items));
    } catch (innerErr) {
      // Something failed after we reserved stock — release it so the
      // counters stay correct.
      for (const [productId, info] of demand) {
        await db.query(
          'UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = NOW() WHERE id = ? AND stock_quantity IS NOT NULL',
          [info.qty, productId]
        ).catch(() => undefined);
      }
      throw innerErr;
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Admin routes must be before /:id so /admin/active is not matched as id=admin

// Admin: pending orders (status 'ny', waiting for acceptance).
// Excludes pre-orders scheduled for a future date (in Europe/Stockholm time).
router.get('/admin/pending', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [rows] = (await db.query(
      "SELECT * FROM orders WHERE status = 'ny' ORDER BY created_at ASC"
    )) as [Row[], unknown];
    const list = Array.isArray(rows) ? rows : [];
    const today = todayInStockholm();
    const sameDay = list.filter((r) => {
      const schedDate = toStockholmDateString(r.scheduled_at as Date | string | null);
      return schedDate == null || schedDate <= today;
    });
    const out = [];
    for (const o of sameDay) {
      const [items] = (await db.query('SELECT * FROM order_items WHERE order_id = ?', [o.id])) as [Row[], unknown];
      out.push(orderRowToOrder(o, Array.isArray(items) ? items : []));
    }
    res.json(out);
  } catch (e) {
    console.error(e);
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

    const defaultPrep = Number(result.order.default_preparation_time_minutes) || 30;
    const totalMinutes = defaultPrep + (extraMinutes ?? 0);
    const estimatedReady = new Date(Date.now() + totalMinutes * 60 * 1000);

    await db.query(
      `UPDATE orders SET status = 'mottagen', estimated_ready_at = ?, updated_at = NOW() WHERE id = ?`,
      [estimatedReady, req.params.id]
    );

    const updated = await getOrderById(req.params.id);
    if (!updated) {
      res.status(500).json({ error: 'Accept succeeded but fetch failed' });
      return;
    }
    res.json(orderRowToOrder(updated.order, updated.items));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to accept order' });
  }
});

// Admin: active orders
router.get('/admin/active', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [rows] = (await db.query(
      "SELECT * FROM orders WHERE status IN ('mottagen', 'påbörjad') ORDER BY created_at ASC"
    )) as [Row[], unknown];
    const list = Array.isArray(rows) ? rows : [];
    const out = [];
    for (const o of list) {
      const [items] = (await db.query('SELECT * FROM order_items WHERE order_id = ?', [o.id])) as [Row[], unknown];
      out.push(orderRowToOrder(o, Array.isArray(items) ? items : []));
    }
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch active orders' });
  }
});

// Admin: pre-orders (scheduled for a future date in Europe/Stockholm time).
// Includes both unaccepted ('ny') and accepted ('mottagen', 'påbörjad') pre-orders.
router.get('/admin/pre-orders', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [rows] = (await db.query(
      "SELECT * FROM orders WHERE scheduled_at IS NOT NULL AND status IN ('ny', 'mottagen', 'påbörjad') ORDER BY scheduled_at ASC"
    )) as [Row[], unknown];
    const list = Array.isArray(rows) ? rows : [];
    const today = todayInStockholm();
    const futureOnly = list.filter((r) => {
      const schedDate = toStockholmDateString(r.scheduled_at as Date | string | null);
      return schedDate != null && schedDate > today;
    });
    const out = [];
    for (const o of futureOnly) {
      const [items] = (await db.query('SELECT * FROM order_items WHERE order_id = ?', [o.id])) as [Row[], unknown];
      out.push(orderRowToOrder(o, Array.isArray(items) ? items : []));
    }
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch pre-orders' });
  }
});

// Admin: history
router.get('/admin/history', requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const dateFrom = req.query.from as string | undefined;
    const dateTo = req.query.to as string | undefined;

    let sql = "SELECT * FROM orders WHERE status IN ('klar', 'avbruten', 'uthämtad', 'levererad')";
    const params: unknown[] = [];

    if (dateFrom) {
      sql += ' AND created_at >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      sql += ' AND created_at < DATE_ADD(?, INTERVAL 1 DAY)';
      params.push(dateTo);
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const [rows] = (await db.query(sql, params)) as [Row[], unknown];
    const list = Array.isArray(rows) ? rows : [];
    const out = [];
    for (const o of list) {
      const [items] = (await db.query('SELECT * FROM order_items WHERE order_id = ?', [o.id])) as [Row[], unknown];
      out.push(orderRowToOrder(o, Array.isArray(items) ? items : []));
    }
    res.json(out);
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
    await db.query("DELETE FROM orders WHERE status IN ('klar', 'avbruten', 'uthämtad', 'levererad')");
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

    // If we're deleting an order that still has stock reserved (i.e. not yet
    // served, cancelled, or refunded), release that stock back to the counter
    // before the rows are gone.
    const existing = await getOrderById(req.params.id);
    if (existing && STOCK_RESERVED_STATUSES.has(String(existing.order.status))) {
      await releaseStockForItems(existing.items);
    }

    await db.query('DELETE FROM orders WHERE id = ?', [req.params.id]);
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

    // Release any reserved stock back to the counter, but only if this is
    // the first time the order is transitioning out of a reserved status.
    const existing = await getOrderById(req.params.id);
    if (existing && STOCK_RESERVED_STATUSES.has(String(existing.order.status))) {
      await releaseStockForItems(existing.items);
    }

    await db.query(
      `UPDATE orders
       SET status = 'avbruten',
           cancelled_at = COALESCE(cancelled_at, NOW()),
           cancellation_reason = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [cancellationReason.trim(), req.params.id]
    );

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

    // If we're cancelling and the order currently has reserved stock, release
    // it before updating so the counters reflect the cancellation.
    if (status === 'avbruten') {
      const existing = await getOrderById(req.params.id);
      if (existing && STOCK_RESERVED_STATUSES.has(String(existing.order.status))) {
        await releaseStockForItems(existing.items);
      }
    }

    const updates: string[] = ['status = ?', 'updated_at = NOW()'];
    const params: unknown[] = [status];
    if (estimatedReadyTime) {
      updates.push('estimated_ready_at = ?');
      params.push(new Date(estimatedReadyTime));
    }
    if (status === 'påbörjad') {
      updates.push('started_at = COALESCE(started_at, NOW())');
    }
    if (status === 'klar') {
      updates.push('completed_at = COALESCE(completed_at, NOW())');
    }
    if (status === 'avbruten') {
      updates.push('cancelled_at = COALESCE(cancelled_at, NOW())');
      updates.push('cancellation_reason = ?');
      params.push(cancellationReason?.trim() ?? null);
    }
    params.push(req.params.id);
    await db.query(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`, params);

    const result = await getOrderById(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Order not found' });
      return;
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
    const updates: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    if (estimatedReadyTime) {
      updates.push('estimated_ready_at = ?');
      params.push(new Date(estimatedReadyTime));
    }
    if (typeof preparationTime === 'number') {
      updates.push('default_preparation_time_minutes = ?');
      params.push(preparationTime);
    }
    if (params.length <= 0) {
      res.status(400).json({ error: 'estimatedReadyTime or preparationTime required' });
      return;
    }
    params.push(req.params.id);
    await db.query(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`, params);

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
    await db.query(
      'UPDATE orders SET internal_notes = ?, updated_at = NOW() WHERE id = ?',
      [trimmed.length > 0 ? trimmed : null, req.params.id]
    );

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
