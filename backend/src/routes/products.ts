import { Router, Request, Response } from 'express';
import { resolveProductImage } from '../shared/utils/productImage.js';
import { supabase, type Row, logSupabaseError, nowIso } from '../db/connection.js';
import { requireAdmin } from '../middleware/auth.js';
import { isCanonicalUuidV4 } from '../utils/resourceId.js';
import { logUnexpectedError } from '../utils/safeErrorMetadata.js';
import type { FoodAllergen, ProductIngredient } from '../shared/types/index.js';

const router = Router();

router.param('id', (_req, res, next, value) => {
  if (!isCanonicalUuidV4(value)) {
    res.status(400).json({ error: 'Invalid resource identifier' });
    return;
  }
  next();
});

const PRODUCT_COLUMNS =
  'id, name, slug, description, image_url, price_ore, stock_status, created_at, updated_at, ingredients_json, allergens, may_contain_allergens, is_prepacked, food_information_verified_at';

const FOOD_ALLERGENS = new Set<FoodAllergen>([
  'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soybeans', 'milk',
  'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs',
]);

function parseAllergens(value: unknown): FoodAllergen[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is FoodAllergen =>
    typeof item === 'string' && FOOD_ALLERGENS.has(item as FoodAllergen)
  );
}

function parseIngredients(value: unknown): ProductIngredient[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name.trim().slice(0, 200) : '';
    if (!name) return [];
    const allergens = parseAllergens(row.allergens);
    return [{ name, ...(allergens.length ? { allergens } : {}) }];
  }).slice(0, 100);
}

function rowToProduct(r: Row): {
  id: string;
  name: string;
  price: number;
  description: string;
  image: string;
  inStock: boolean;
  createdAt: string;
  updatedAt: string;
  ingredients?: ProductIngredient[];
  allergens?: FoodAllergen[];
  mayContainAllergens?: FoodAllergen[];
  isPrepacked?: boolean;
  foodInformationVerifiedAt?: string;
} {
  const status = (r.stock_status as string) ?? 'instock';
  const inStock = status === 'instock';
  const createdAt = r.created_at as string | Date | undefined;
  const updatedAt = r.updated_at as string | Date | undefined;
  const product = {
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
  const verifiedAt = String(r.food_information_verified_at ?? '').trim();
  if (!verifiedAt) return product;

  return {
    ...product,
    ingredients: parseIngredients(r.ingredients_json),
    allergens: parseAllergens(r.allergens),
    mayContainAllergens: parseAllergens(r.may_contain_allergens),
    isPrepacked: r.is_prepacked === true,
    foodInformationVerifiedAt: verifiedAt,
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
      return res.status(500).json({ error: 'Failed to fetch products' });
    }

    return res.status(200).json((data ?? []).map((r) => rowToProduct(r as Row)));
  } catch (e) {
    logUnexpectedError('GET /api/products unexpected error', e);
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
      return res.status(500).json({ error: 'Failed to fetch product' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.status(200).json(rowToProduct(data as Row));
  } catch (e) {
    logUnexpectedError('GET /api/products/:id unexpected error', e);
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
      return res.status(500).json({ error: 'Failed to update stock' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.status(200).json(rowToProduct(data as Row));
  } catch (e) {
    logUnexpectedError('PATCH /api/products/:id/stock unexpected error', e);
    return res.status(500).json({ error: 'Failed to update stock' });
  }
});

export default router;
