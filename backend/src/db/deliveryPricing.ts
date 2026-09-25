import { supabase, type Row } from './connection.js';
import { parseDeliveryPricing } from '../shared/utils/deliveryPricing.js';

export function deliveryPricingFromRow(row: Row) {
  return parseDeliveryPricing({
    defaultFeeOre: row.delivery_default_fee_ore,
    cityFees: row.delivery_city_fees,
  });
}

export async function loadDeliveryPricing() {
  const { data, error } = await supabase.from('admin_settings')
    .select('delivery_default_fee_ore, delivery_city_fees').limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Leveransinställningar saknas.');
  return deliveryPricingFromRow(data);
}
