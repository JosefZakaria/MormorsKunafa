import { Router, Request, Response } from 'express';
import { resolveProductImage } from '../utils/productImage.js';
import { supabase, type Row, logSupabaseError, nowIso } from '../db/connection.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

const PRODUCT_COLUMNS =
  'id, name, slug, description, image_url, price_ore, stock_status, created_at, updated_at';

function rowToProduct(r: Row): {
  id: string;
  name: string;
  price: number;
  description: string;
  image: string;
  inStock: boolean;
  createdAt: string;
  updatedAt: string;
} {
  const status = (r.stock_status as string) ?? 'instock';
  const inStock = status === 'instock';
  const createdAt = r.created_at as string | Date | undefined;
  const updatedAt = r.updated_at as string | Date | undefined;
  return {
    id: String(r.id),
    name: String(r.name),
    price: Number(r.price_ore),
    description: String(r.description ?? ''),
    image: resolveProductImage(String(r.id), r.image_url as string | null, r.slug as string | null),
    inStock,
    createdAt:
      createdAt instanceof Date ? createdAt.toISOString() : String(createdAt ?? ''),
    updatedAt:
      updatedAt instanceof Date ? updatedAt.toISOString() : String(updatedAt ?? ''),
  };
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_COLUMNS)
      .order('name', { ascending: true });

    if (error) {
      logSupabaseError('GET /api/products', error);
      return res.status(500).json({
        error: 'Failed to fetch products',
        details: error.message,
      });
    }

    return res.status(200).json((data ?? []).map((r) => rowToProduct(r as Row)));
  } catch (e) {
    console.error('[GET /api/products] unexpected error:', e);
    return res.status(500).json({ error: 'Failed to fetch products' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) {
      logSupabaseError('GET /api/products/:id', error);
      return res.status(500).json({
        error: 'Failed to fetch product',
        details: error.message,
      });
    }

    if (!data) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.status(200).json(rowToProduct(data as Row));
  } catch (e) {
    console.error('[GET /api/products/:id] unexpected error:', e);
    return res.status(500).json({ error: 'Failed to fetch product' });
  }
});

router.patch('/:id/stock', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { inStock } = req.body as { inStock?: boolean };
    if (typeof inStock !== 'boolean') {
      return res.status(400).json({ error: 'inStock must be boolean' });
    }

    const { data, error } = await supabase
      .from('products')
      .update({
        stock_status: inStock ? 'instock' : 'outofstock',
        updated_at: nowIso(),
      })
      .eq('id', req.params.id)
      .select(PRODUCT_COLUMNS)
      .maybeSingle();

    if (error) {
      logSupabaseError('PATCH /api/products/:id/stock', error);
      return res.status(500).json({
        error: 'Failed to update stock',
        details: error.message,
      });
    }

    if (!data) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.status(200).json(rowToProduct(data as Row));
  } catch (e) {
    console.error('[PATCH /api/products/:id/stock] unexpected error:', e);
    return res.status(500).json({ error: 'Failed to update stock' });
  }
});

export default router;
