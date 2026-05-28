import 'dotenv/config';
import { supabase, logSupabaseError, type Row } from '../db/connection.js';
import { sanitizeProductName } from '../utils/sanitizeProductName.js';

const BATCH_SIZE = 500;

async function main() {
  console.log('Cleaning order_items.product_name_snapshot...');

  let updated = 0;
  let skipped = 0;
  let from = 0;

  while (true) {
    const to = from + BATCH_SIZE - 1;
    const { data, error } = await supabase
      .from('order_items')
      .select('id, product_name_snapshot')
      .range(from, to);

    if (error) {
      logSupabaseError('cleanup-order-item-product-name-snapshots select', error);
      throw error;
    }

    const rows = (data ?? []) as Row[];
    if (rows.length === 0) break;

    for (const row of rows) {
      const id = String(row.id ?? '');
      const current = String(row.product_name_snapshot ?? '');
      const cleaned = sanitizeProductName(current);

      if (!id || current === cleaned) {
        skipped += 1;
        continue;
      }

      const { error: updateError } = await supabase
        .from('order_items')
        .update({ product_name_snapshot: cleaned })
        .eq('id', id);

      if (updateError) {
        logSupabaseError('cleanup-order-item-product-name-snapshots update', updateError);
        throw updateError;
      }

      updated += 1;
    }

    from += rows.length;
    console.log(`Processed ${from} rows... updated ${updated}, unchanged ${skipped}`);
  }

  console.log(`Done. Updated ${updated} rows, unchanged ${skipped}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
