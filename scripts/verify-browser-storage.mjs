import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, 'apps', 'web', 'src');
const storageUtility = 'utils/browserStorage.ts';
const allowedSessionStorageFiles = new Set([
  'services/api.ts',
  'pages/Cart/Cart.tsx',
  'pages/Landing/Landing.tsx',
]);
const allowedCookieFiles = new Set(['services/api.ts']);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.[cm]?[jt]sx?$/u.test(entry.name) ? [absolute] : [];
  }));
  return nested.flat();
}

const failures = [];
for (const absolute of await sourceFiles(sourceRoot)) {
  const relative = path.relative(sourceRoot, absolute).replaceAll('\\', '/');
  const content = await readFile(absolute, 'utf8');
  if (relative !== storageUtility && /\blocalStorage\b/u.test(content)) {
    failures.push(`${relative}: direct localStorage access must use ${storageUtility}`);
  }
  if (/\bsessionStorage\b/u.test(content) && !allowedSessionStorageFiles.has(relative)) {
    failures.push(`${relative}: undocumented sessionStorage access`);
  }
  if (/\bdocument\.cookie\b/u.test(content) && !allowedCookieFiles.has(relative)) {
    failures.push(`${relative}: undocumented script-readable cookie access`);
  }
  if (/fonts\.(?:googleapis|gstatic)\.com|<iframe\b/iu.test(content)) {
    failures.push(`${relative}: automatically loaded third-party font or iframe`);
  }
}

const policy = await readFile(path.join(projectRoot, 'Docs', 'BROWSER_STORAGE.md'), 'utf8');
for (const documentedKey of [
  'mormors-kunafa-cart',
  'language',
  'printer_ip',
  'printer_devid',
  'admin_alarm_volume',
  'orderType',
  'order-status-token:<order UUID>',
  'mk_admin_session',
  'mk_csrf',
]) {
  if (!policy.includes(`\`${documentedKey}\``)) {
    failures.push(`Docs/BROWSER_STORAGE.md: missing ${documentedKey}`);
  }
}

if (failures.length > 0) {
  console.error(`Browser storage policy verification failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log('Verified browser storage access, documentation and third-party loading policy.');
}
