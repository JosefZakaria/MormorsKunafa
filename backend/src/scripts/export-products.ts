import 'dotenv/config';
import { logSupabaseError, supabase } from '../db/connection.js';
import { requireExternalOutputPath, writeSensitiveArtifact } from './safe-local-artifact.js';

async function run() {
  const outputPath = requireExternalOutputPath(process.argv.slice(2));
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('name', { ascending: true });
  if (error) {
    logSupabaseError('export-products', error);
    throw new Error('Kunde inte läsa produkterna.');
  }
  writeSensitiveArtifact(outputPath, JSON.stringify(data ?? [], null, 2));
  console.log('Produktfilen skrevs till den uttryckligen valda platsen utanför repot.');
  process.exit(0);
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Exporten misslyckades.');
  process.exit(1);
});
