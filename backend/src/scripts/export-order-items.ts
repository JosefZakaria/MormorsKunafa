import 'dotenv/config';
import { logSupabaseError, supabase } from '../db/connection.js';
import { requireExternalOutputPath, writeSensitiveArtifact } from './safe-local-artifact.js';

async function run() {
  const outputPath = requireExternalOutputPath(process.argv.slice(2));
  const { data, error } = await supabase
    .from('order_items')
    .select('order_id, product_id, product_name_snapshot, quantity, price_ore');
  if (error) {
    logSupabaseError('export-order-items', error);
    throw new Error('Kunde inte läsa orderraderna.');
  }
  writeSensitiveArtifact(outputPath, JSON.stringify(data ?? [], null, 2));
  console.log('Orderradsfilen skrevs till den uttryckligen valda platsen utanför repot.');
  process.exit(0);
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Exporten misslyckades.');
  process.exit(1);
});
