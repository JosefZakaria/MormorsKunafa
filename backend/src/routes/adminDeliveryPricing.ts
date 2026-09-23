import { Router, type Response } from 'express';
import { supabase, nowIso, logSupabaseError } from '../db/connection.js';
import { requireAdmin, requireOwner } from '../middleware/auth.js';
import { parseDeliveryPricing } from '../shared/utils/deliveryPricing.js';
import { deliveryPricingFromRow as pricingFromRow } from '../db/deliveryPricing.js';

const router = Router();
const columns = 'id, delivery_default_fee_ore, delivery_city_fees';
router.use(requireAdmin, requireOwner);

function databaseError(res: Response, error: Parameters<typeof logSupabaseError>[1]) {
  logSupabaseError('admin delivery pricing', error);
  const missingMigration = error?.code === '42703' || error?.code === 'PGRST204';
  res.status(missingMigration ? 503 : 500).json({
    error: missingMigration
      ? 'Leveransinställningarna är inte tillgängliga. Databasmigrationen för leveranspriser behöver köras.'
      : 'Kunde inte läsa eller spara leveranspriser. Försök igen.',
  });
}

router.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabase.from('admin_settings').select(columns).limit(1).maybeSingle();
    if (error) { databaseError(res, error); return; }
    if (!data) { res.status(404).json({ error: 'Leveransinställningar saknas.' }); return; }
    res.json(pricingFromRow(data));
  } catch (error) {
    console.error('[GET delivery pricing]', error);
    res.status(500).json({ error: 'Kunde inte läsa leveranspriser. Kontrollera de sparade inställningarna.' });
  }
});

router.patch('/', async (req, res) => {
  let pricing;
  try {
    pricing = parseDeliveryPricing(req.body);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Ogiltiga leveranspriser.' });
    return;
  }
  try {
    const { data: settings, error: readError } = await supabase
      .from('admin_settings').select('id').limit(1).maybeSingle();
    if (readError) { databaseError(res, readError); return; }
    if (!settings) { res.status(404).json({ error: 'Leveransinställningar saknas.' }); return; }

    // Save the default and all city prices together; never modify other settings.
    const { data, error } = await supabase.from('admin_settings').update({
      delivery_default_fee_ore: pricing.defaultFeeOre,
      delivery_city_fees: pricing.cityFees,
      updated_at: nowIso(),
    }).eq('id', settings.id).select(columns).maybeSingle();
    if (error) { databaseError(res, error); return; }
    if (!data) { res.status(404).json({ error: 'Leveransinställningar saknas. Ladda om sidan.' }); return; }
    res.json(pricingFromRow(data));
  } catch (error) {
    console.error('[PATCH delivery pricing]', error);
    res.status(500).json({ error: 'Kunde inte spara leveranspriser. Försök igen.' });
  }
});

export default router;
