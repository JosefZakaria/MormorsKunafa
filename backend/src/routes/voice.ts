import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { logSupabaseError, supabase } from '../db/connection.js';
import { listLocations } from '../db/locations.js';
import { inStockAtLocation, loadStockMap } from '../db/productLocationStock.js';
import {
  buildVoiceProductChoices, currentVoiceCatalogPrice, VOICE_PRODUCT_RULES, VOICE_UNAVAILABLE_PRODUCTS,
  type VoiceCatalogProduct,
} from '../utils/voiceOrderPolicy.js';

type CatalogRow = VoiceCatalogProduct & { name: string; stock_status: string | null };

const router = Router();
const phoneProductIds: string[] = VOICE_PRODUCT_RULES.flatMap(rule =>
  'availableWhenHidden' in rule ? [rule.productId] : []
);

function hash(value: string) {
  return createHash('sha256').update(value).digest();
}

router.get('/catalog', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const secret = process.env.VOICE_AGENT_API_KEY?.trim();
  if (!secret || secret.length < 32) {
    res.status(503).json({ error: 'Voice catalog unavailable' });
    return;
  }
  const token = req.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token || !timingSafeEqual(hash(token), hash(secret))) {
    res.set('WWW-Authenticate', 'Bearer');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const [{ data, error }, locations, stockMap] = await Promise.all([
      supabase.from('products').select('id, name, price_ore, variant_prices, hidden, stock_status')
        .or(`hidden.eq.false,id.in.(${phoneProductIds.join(',')})`).order('sort_order'),
      listLocations(),
      loadStockMap(),
    ]);
    if (error) {
      logSupabaseError('voice catalog', error);
      throw error;
    }
    if (locations.length === 0) throw new Error('No pickup locations');

    const rows = (data ?? []) as CatalogRow[];
    const choices = new Map<string, ReturnType<typeof buildVoiceProductChoices>[number]>(
      buildVoiceProductChoices(rows).map(choice => [choice.productId, choice])
    );
    const products = rows.filter(row => row.hidden === false || phoneProductIds.includes(row.id));

    res.json({
      currency: 'SEK',
      unavailableProducts: VOICE_UNAVAILABLE_PRODUCTS,
      locations: locations.map(({ id, slug, name, address }) => ({ id, slug, name, address })),
      products: products.map(row => {
        const choice = choices.get(row.id);
        const pickupLocationSlug = choice && 'pickupLocationSlug' in choice ? choice.pickupLocationSlug : null;
        // Phone-only products require an explicit stock flag for the pickup location.
        const fallbackInStock = row.stock_status === 'instock' && !phoneProductIds.includes(row.id);
        const stockByLocation = Object.fromEntries(locations.map(location => [
          location.id,
          (!pickupLocationSlug || pickupLocationSlug === location.slug) &&
            inStockAtLocation(row.id, location.id, stockMap, fallbackInStock),
        ]));
        const options = choice ? choice.options.map(option => ({
          key: option.key,
          label: option.catalogOption,
          persons: option.persons,
          priceOre: option.priceOre,
        })) : catalogOptions(row);

        return {
          id: row.id,
          name: choice?.name ?? row.name,
          ...(choice && { key: choice.key }),
          ...(pickupLocationSlug && { pickupLocationSlug }),
          ...(choice && 'minimumLeadMinutes' in choice && { minimumLeadMinutes: choice.minimumLeadMinutes }),
          options,
          stockByLocation,
        };
      }),
    });
  } catch {
    res.status(503).json({ error: 'Voice catalog unavailable' });
  }
});

function catalogOptions(row: CatalogRow) {
  const variants = row.variant_prices;
  const labels = variants && typeof variants === 'object' && !Array.isArray(variants) ? Object.keys(variants) : [];
  if (labels.length === 0) {
    return [{ label: null, priceOre: currentVoiceCatalogPrice(row, null) }];
  }
  return labels.map(label => ({ label, priceOre: currentVoiceCatalogPrice(row, label) }));
}

export default router;
