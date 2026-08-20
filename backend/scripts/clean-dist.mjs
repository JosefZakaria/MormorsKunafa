import { dirname, resolve, basename } from 'node:path';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(backendRoot, 'dist');

if (dirname(target) !== backendRoot || basename(target) !== 'dist') {
  throw new Error(`Refusing to clean unexpected build target: ${target}`);
}

rmSync(target, { recursive: true, force: true });
console.log('[clean-dist] Removed the verified backend build directory.');
