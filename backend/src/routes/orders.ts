import { Router, Request, Response } from 'express';
import { db, generateId, type Row } from '../db/connection.js';
import { requireAdmin } from '../middleware/auth.js';
import { PrinterService } from '../services/PrinterService.js';

const router = Router();

const ACTIVE_STATUSES = ['mottagen', 'påbörjad'] as const;

function orderRowToOrder(r: Row, items: Row[]): Record<string, unknown> {
  const deliveryInfo = r.delivery_info_json != null
    ? (typeof r.delivery_info_json === 'string' ? JSON.parse(r.delivery_info_json as string) : r.delivery_info_json)
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
    deliveryInfo,
    createdAt: (r.created_at as Date)?.toISOString?.() ?? r.created_at,
    updatedAt: (r.updated_at as Date)?.toISOString?.() ?? r.updated_at,
    startedAt: (r.started_at as Date)?.toISOString?.() ?? r.started_at,
    completedAt: (r.completed_at as Date)?.toISOString?.() ?? r.completed_at,
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

    const orderId = generateId();
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
        body.deliveryInfo?.name ?? null,
        body.deliveryInfo?.email ?? null,
        body.deliveryInfo?.phone ?? null,
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
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Admin routes must be before /:id so /admin/active is not matched as id=admin

// Admin: pending orders (status 'ny', waiting for acceptance)
router.get('/admin/pending', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [rows] = (await db.query(
      "SELECT * FROM orders WHERE status = 'ny' ORDER BY created_at ASC"
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

// Admin: pre-orders (scheduled in the future)
router.get('/admin/pre-orders', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [rows] = (await db.query(
      'SELECT * FROM orders WHERE scheduled_at IS NOT NULL AND scheduled_at > NOW() AND status IN (?, ?) ORDER BY scheduled_at ASC',
      ['mottagen', 'påbörjad']
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
    res.status(500).json({ error: 'Failed to fetch pre-orders' });
  }
});

// Admin: history
router.get('/admin/history', requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const [rows] = (await db.query(
      'SELECT * FROM orders ORDER BY created_at DESC LIMIT ?',
      [limit]
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
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Admin: update status
router.patch('/admin/:id/status', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status, estimatedReadyTime } = req.body as { status?: string; estimatedReadyTime?: string };
    if (!status || !['ny', 'mottagen', 'påbörjad', 'klar', 'avbruten', 'uthämtad', 'levererad'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
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
