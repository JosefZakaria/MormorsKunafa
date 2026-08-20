import 'dotenv/config';
import { logSupabaseError, supabase } from '../db/connection.js';
import { requireExternalOutputPath, writeSensitiveArtifact } from './safe-local-artifact.js';

async function run() {
  const outputPath = requireExternalOutputPath(process.argv.slice(2));
  const { data, error } = await supabase
    .from('products')
    .select('name')
    .order('name', { ascending: true });
  if (error) {
    logSupabaseError('check-menu', error);
    throw new Error('Kunde inte läsa produktmenyn.');
  }
  writeSensitiveArtifact(outputPath, JSON.stringify(data ?? [], null, 2));
  console.log('Menyfilen skrevs till den uttryckligen valda platsen utanför repot.');
}

run().then(() => process.exit(0)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Menyexporten misslyckades.');
  process.exit(1);
});
