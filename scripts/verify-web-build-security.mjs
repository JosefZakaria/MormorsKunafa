import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const buildDirectory = path.resolve(process.cwd(), 'apps/web/dist');
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.mjs']);
const forbiddenPatterns = [
  ['private key block', /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/u],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/u],
  ['Stripe secret key', /\bsk_(?:live|test)_[0-9A-Za-z]{16,}\b/u],
  [
    'server-only environment variable name',
    /\b(?:JWT_SECRET|STRIPE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|SWISH_CERTIFICATE_P12|VAPID_PRIVATE_KEY)\b/u,
  ],
  ['source map reference', /sourceMappingURL\s*=/u],
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolutePath)));
    else if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

const files = await walk(buildDirectory);
const failures = [];

for (const file of files) {
  const relativePath = path.relative(buildDirectory, file).replaceAll('\\', '/');
  if (file.endsWith('.map')) {
    failures.push(`${relativePath}: source map file`);
    continue;
  }
  if (!textExtensions.has(path.extname(file))) continue;

  const contents = await readFile(file, 'utf8');
  for (const [label, pattern] of forbiddenPatterns) {
    if (pattern.test(contents)) failures.push(`${relativePath}: ${label}`);
  }
}

if (failures.length > 0) {
  console.error('Unsafe web build artifacts detected:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Verified ${files.length} web build artifacts: no source maps or known server-secret formats.`);
}
