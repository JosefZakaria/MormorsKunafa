import 'dotenv/config';
import { readAllRows } from '../db/pagination.js';
import { requireExternalOutputPath, writeSensitiveArtifact } from './safe-local-artifact.js';

async function run() {
  const outputPath = requireExternalOutputPath(process.argv.slice(2));
  const data = (await readAllRows('products', 'id, name')).map(({name})=>({name}))
    .sort((a,b)=>String(a.name).localeCompare(String(b.name),'sv'));
  writeSensitiveArtifact(outputPath, JSON.stringify(data ?? [], null, 2));
  console.log('Menyfilen skrevs till den uttryckligen valda platsen utanför repot.');
}

run().then(() => process.exit(0)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Menyexporten misslyckades.');
  process.exit(1);
});
