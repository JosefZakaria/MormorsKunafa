import { Router, Request, Response } from 'express';
import { resolveProductImage } from '../utils/productImage.js';
import { generateId, supabase, type Row, logSupabaseError, nowIso } from '../db/connection.js';
import { readAdminFromRequest, requireAdmin, requireOwner } from '../middleware/auth.js';
import { sanitizeProductName } from '../utils/sanitizeProductName.js';
import { parsePriceOre, parseVariantPricesInput, variantPricesForProduct } from '../utils/productPrices.js';

const router = Router();

export const PRODUCT_COLUMNS =
  'id, name, slug, description, image_url, price_ore, variant_prices, stock_status, hidden, sort_order, created_at, updated_at';

export function rowToProduct(r: Row): {
  id: string;
  name: string;
  price: number;
  description: string;
  image: string;
  inStock: boolean;
  hidden: boolean;
  sortOrder: number;
  variantPrices?: Record<string, number>;
  createdAt: string;
  updatedAt: string;
} {
  const status = (r.stock_status as string) ?? 'instock';
  const inStock = status === 'instock';
  const createdAt = r.created_at as string | Date | undefined;
  const updatedAt = r.updated_at as string | Date | undefined;
  const id = String(r.id);
  const variantPrices = variantPricesForProduct(id, r.variant_prices) ?? undefined;
  return {
    id,
    name: String(r.name),
    price: Number(r.price_ore),
    description: String(r.description ?? ''),
    image: resolveProductImage(id, r.image_url as string | null, r.slug as string | null),
    inStock,
    hidden: r.hidden === true,
    sortOrder: Number(r.sort_order) || 0,
    ...(variantPrices ? { variantPrices } : {}),
    createdAt:
      createdAt instanceof Date ? createdAt.toISOString() : String(createdAt ?? ''),
    updatedAt:
      updatedAt instanceof Date ? updatedAt.toISOString() : String(updatedAt ?? ''),
  };
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'vara';
}

function isHttpOrRelativeUrl(value: string): boolean {
  return value.startsWith('/') || value.startsWith('http://') || value.startsWith('https://');
}

async function uniqueSlug(baseName: string): Promise<string> {
  const root = slugify(baseName);
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const { data, error } = await supabase
      .from('products')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();
    if (error) {
      logSupabaseError('products uniqueSlug', error);
      throw error;
    }
    if (!data) return candidate;
  }
  return `${root}-${generateId().slice(0, 8)}`;
}

async function nextSortOrder(): Promise<number> {
  const { data, error } = await supabase
    .from('products')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logSupabaseError('products nextSortOrder', error);
    throw error;
  }
  return (Number((data as Row | null)?.sort_order) || 0) + 1;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const includeHidden = Boolean(readAdminFromRequest(req));
    let query = supabase
      .from('products')
      .select(PRODUCT_COLUMNS)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (!includeHidden) {
      query = query.eq('hidden', false);
    }
    const { data, error } = await query;

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

    if ((data as Row).hidden === true && !readAdminFromRequest(req)) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.status(200).json(rowToProduct(data as Row));
  } catch (e) {
    console.error('[GET /api/products/:id] unexpected error:', e);
    return res.status(500).json({ error: 'Failed to fetch product' });
  }
});

router.patch('/:id/stock', requireAdmin, requireOwner, async (req: Request, res: Response) => {
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

router.patch('/reorder', requireAdmin, requireOwner, async (req: Request, res: Response) => {
  try {
    const orderedIds = (req.body as { orderedIds?: unknown }).orderedIds;
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ error: 'orderedIds must be a non-empty array' });
    }
    const ids = orderedIds.map((id) => String(id ?? '').trim()).filter(Boolean);
    if (ids.length !== orderedIds.length) {
      return res.status(400).json({ error: 'orderedIds must contain product ids' });
    }
    if (new Set(ids).size !== ids.length) {
      return res.status(400).json({ error: 'orderedIds must be unique' });
    }

    const { data: existing, error: existingError } = await supabase.from('products').select('id');
    if (existingError) {
      logSupabaseError('PATCH /api/products/reorder', existingError);
      return res.status(500).json({ error: 'Failed to reorder products', details: existingError.message });
    }
    const known = new Set((existing ?? []).map((r) => String((r as Row).id)));
    const unknown = ids.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      return res.status(400).json({ error: 'Unknown product id', details: unknown[0] });
    }

    for (let i = 0; i < ids.length; i++) {
      const { error } = await supabase
        .from('products')
        .update({ sort_order: i + 1, updated_at: nowIso() })
        .eq('id', ids[i]);
      if (error) {
        logSupabaseError('PATCH /api/products/reorder update', error);
        return res.status(500).json({ error: 'Failed to reorder products', details: error.message });
      }
    }

    const leftover = [...known].filter((id) => !ids.includes(id));
    leftover.sort();
    for (let i = 0; i < leftover.length; i++) {
      const { error } = await supabase
        .from('products')
        .update({ sort_order: ids.length + i + 1, updated_at: nowIso() })
        .eq('id', leftover[i]);
      if (error) {
        logSupabaseError('PATCH /api/products/reorder leftover', error);
        return res.status(500).json({ error: 'Failed to reorder products', details: error.message });
      }
    }

    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_COLUMNS)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) {
      logSupabaseError('PATCH /api/products/reorder list', error);
      return res.status(500).json({ error: 'Failed to reorder products', details: error.message });
    }
    return res.status(200).json((data ?? []).map((r) => rowToProduct(r as Row)));
  } catch (e) {
    console.error('[PATCH /api/products/reorder] unexpected error:', e);
    return res.status(500).json({ error: 'Failed to reorder products' });
  }
});

router.post('/', requireAdmin, requireOwner, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = sanitizeProductName(String(body.name ?? '').trim());
    if (!name || name.length > 200) {
      return res.status(400).json({ error: 'name is required (max 200 characters)' });
    }

    const priceOre = parsePriceOre(body.price);
    if (priceOre == null) {
      return res.status(400).json({ error: 'price must be a number in öre' });
    }

    const description = typeof body.description === 'string' ? body.description.slice(0, 10000) : '';
    const image = typeof body.image === 'string' ? body.image.trim() : '';
    if (image && !isHttpOrRelativeUrl(image)) {
      return res.status(400).json({ error: 'image must be a URL or a site path' });
    }

    let variantPrices: Record<string, number> | null = null;
    if (body.variantPrices !== undefined) {
      const parsed = parseVariantPricesInput(body.variantPrices);
      if (parsed === 'invalid') {
        return res.status(400).json({ error: 'variantPrices must be option labels mapped to prices in öre' });
      }
      variantPrices = parsed;
    }

    const inStock = body.inStock !== false;
    const id = generateId();
    const slug = await uniqueSlug(name);
    const sortOrder = await nextSortOrder();

    const { data, error } = await supabase
      .from('products')
      .insert({
        id,
        name,
        slug,
        description,
        image_url: image || null,
        price_ore: priceOre,
        variant_prices: variantPrices,
        stock_status: inStock ? 'instock' : 'outofstock',
        sort_order: sortOrder,
        created_at: nowIso(),
        updated_at: nowIso(),
      })
      .select(PRODUCT_COLUMNS)
      .maybeSingle();

    if (error) {
      logSupabaseError('POST /api/products', error);
      return res.status(500).json({ error: 'Failed to create product', details: error.message });
    }
    if (!data) {
      return res.status(500).json({ error: 'Failed to create product' });
    }
    return res.status(201).json(rowToProduct(data as Row));
  } catch (e) {
    console.error('[POST /api/products] unexpected error:', e);
    return res.status(500).json({ error: 'Failed to create product' });
  }
});

router.patch('/:id', requireAdmin, requireOwner, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: nowIso() };

    if (typeof body.name === 'string') {
      const name = sanitizeProductName(body.name.trim());
      if (!name || name.length > 200) {
        return res.status(400).json({ error: 'name is required (max 200 characters)' });
      }
      patch.name = name;
    }
    if (body.price !== undefined) {
      const priceOre = parsePriceOre(body.price);
      if (priceOre == null) {
        return res.status(400).json({ error: 'price must be a number in öre' });
      }
      patch.price_ore = priceOre;
    }
    if (typeof body.description === 'string') {
      patch.description = body.description.slice(0, 10000);
    }
    if (typeof body.image === 'string') {
      const image = body.image.trim();
      if (image && !isHttpOrRelativeUrl(image)) {
        return res.status(400).json({ error: 'image must be a URL or a site path' });
      }
      patch.image_url = image || null;
    }
    if (typeof body.inStock === 'boolean') {
      patch.stock_status = body.inStock ? 'instock' : 'outofstock';
    }
    if (typeof body.hidden === 'boolean') {
      patch.hidden = body.hidden;
    }
    if (body.variantPrices !== undefined) {
      const parsed = parseVariantPricesInput(body.variantPrices);
      if (parsed === 'invalid') {
        return res.status(400).json({ error: 'variantPrices must be option labels mapped to prices in öre' });
      }
      patch.variant_prices = parsed;
      if (parsed && body.price === undefined) {
        patch.price_ore = Math.min(...Object.values(parsed));
      }
    }

    if (Object.keys(patch).length <= 1) {
      return res.status(400).json({ error: 'No product fields to update' });
    }

    const { data, error } = await supabase
      .from('products')
      .update(patch)
      .eq('id', req.params.id)
      .select(PRODUCT_COLUMNS)
      .maybeSingle();

    if (error) {
      logSupabaseError('PATCH /api/products/:id', error);
      return res.status(500).json({ error: 'Failed to update product', details: error.message });
    }
    if (!data) {
      return res.status(404).json({ error: 'Product not found' });
    }
    return res.status(200).json(rowToProduct(data as Row));
  } catch (e) {
    console.error('[PATCH /api/products/:id] unexpected error:', e);
    return res.status(500).json({ error: 'Failed to update product' });
  }
});

router.delete('/:id', requireAdmin, requireOwner, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? '').trim();
    if (!id) {
      return res.status(400).json({ error: 'id required' });
    }

    const { data: existing, error: lookupError } = await supabase
      .from('products')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (lookupError) {
      logSupabaseError('DELETE /api/products/:id lookup', lookupError);
      return res.status(500).json({ error: 'Failed to delete product', details: lookupError.message });
    }
    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const { error: unlinkError } = await supabase
      .from('order_items')
      .update({ product_id: null })
      .eq('product_id', id);
    if (unlinkError) {
      logSupabaseError('DELETE /api/products/:id unlink', unlinkError);
      return res.status(500).json({ error: 'Failed to delete product', details: unlinkError.message });
    }

    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      logSupabaseError('DELETE /api/products/:id', error);
      return res.status(500).json({ error: 'Failed to delete product', details: error.message });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[DELETE /api/products/:id] unexpected error:', e);
    return res.status(500).json({ error: 'Failed to delete product' });
  }
});

export default router;
