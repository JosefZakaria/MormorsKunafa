import { Router, Request, Response } from 'express';
import { db, type Row } from '../db/connection.js';

const router = Router();

function rowToProduct(r: Row): { id: string; name: string; price: number; description: string; image: string; inStock: boolean; createdAt: string; updatedAt: string } {
  const status = (r.stock_status as string) ?? 'instock';
  const qty = r.stock_quantity as number | null;
  const inStock = status === 'instock' && (qty === null || qty > 0);
  return {
    id: String(r.id),
    name: String(r.name),
    price: Number(r.price_ore),
    description: String(r.description ?? ''),
    image: String(r.image_url ?? ''),
    inStock,
    createdAt: (r.created_at as Date)?.toISOString?.() ?? String(r.created_at),
    updatedAt: (r.updated_at as Date)?.toISOString?.() ?? String(r.updated_at),
  };
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const [rows] = (await db.query(
      'SELECT id, name, slug, description, image_url, price_ore, stock_quantity, stock_status, created_at, updated_at FROM products ORDER BY name'
    )) as [Row[], unknown];
    const list = Array.isArray(rows) ? rows : [];
    res.json(list.map(rowToProduct));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const [rows] = (await db.query(
      'SELECT id, name, slug, description, image_url, price_ore, stock_quantity, stock_status, created_at, updated_at FROM products WHERE id = ?',
      [req.params.id]
    )) as [Row[], unknown];
    const list = Array.isArray(rows) ? rows : [];
    if (list.length === 0) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.json(rowToProduct(list[0]));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

export default router;
