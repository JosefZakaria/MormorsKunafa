import 'dotenv/config';
import { readAllRows } from '../db/pagination.js';
import { requireExternalOutputPath, writeSensitiveArtifact } from './safe-local-artifact.js';

async function run() {
  const outputPath = requireExternalOutputPath(process.argv.slice(2));
  const data = (await readAllRows('products', '*')).sort((a,b)=>String(a.name).localeCompare(String(b.name),'sv'));
  writeSensitiveArtifact(outputPath, JSON.stringify(data ?? [], null, 2));
  console.log('Produktfilen skrevs till den uttryckligen valda platsen utanför repot.');
  process.exit(0);
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Exporten misslyckades.');
  process.exit(1);
});
