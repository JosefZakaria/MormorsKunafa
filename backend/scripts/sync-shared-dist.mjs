import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sharedDist = join(backendRoot, '..', 'shared', 'dist');
const mode = process.argv[2] ?? 'all';

if (!existsSync(sharedDist)) {
  console.error('[sync-shared-dist] Missing shared build at', sharedDist);
  process.exit(1);
}

const targets =
  mode === 'src'
    ? ['src/shared']
    : mode === 'dist'
      ? ['dist/shared']
      : ['src/shared', 'dist/shared'];

for (const target of targets) {
  const dest = join(backendRoot, target);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(sharedDist, dest, { recursive: true });
  console.log('[sync-shared-dist] Copied to', dest);
}
