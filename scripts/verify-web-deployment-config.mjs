import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  APPROVED_PREVIEW_API_ORIGINS,
  PRODUCTION_API_ORIGIN,
  createWebVercelConfig,
} from '../apps/web/config/vercel-config.mjs';

const root = process.cwd();
const webRoot = path.join(root, 'apps', 'web');
const fail = (message) => { throw new Error(`[web deployment] ${message}`); };

let configImportCounter = 0;
const deploymentKeys = ['VERCEL_ENV', 'PREVIEW_API_ORIGIN', 'PRODUCTION_API_ORIGINS'];
async function loadDeploymentConfig(overrides) {
  const previous = new Map(deploymentKeys.map((key) => [key, process.env[key]]));
  for (const key of deploymentKeys) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) process.env[key] = value;

  try {
    const configUrl = pathToFileURL(path.join(webRoot, 'vercel.mjs'));
    configUrl.searchParams.set('verification', String(configImportCounter++));
    return (await import(configUrl.href)).config;
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const config = await loadDeploymentConfig({ VERCEL_ENV: 'production' });
const previewOrigin = 'https://mormors-kunafa-test-api.example.test';
const previewConfig = createWebVercelConfig(
  {
    VERCEL_ENV: 'preview',
    PREVIEW_API_ORIGIN: previewOrigin,
  },
  [previewOrigin]
);
const developmentConfig = await loadDeploymentConfig({ VERCEL_ENV: 'development' });

await assert.rejects(
  loadDeploymentConfig({ VERCEL_ENV: 'preview' }),
  /PREVIEW_API_ORIGIN must be an explicit HTTPS origin/
);
await assert.rejects(
  loadDeploymentConfig({
    VERCEL_ENV: 'preview',
    PREVIEW_API_ORIGIN: previewOrigin,
  }),
  /not present in the committed approved Preview API origin allowlist/
);
assert.equal(APPROVED_PREVIEW_API_ORIGINS.length, 0, 'Preview must remain blocked until an isolated origin is reviewed');
for (const productionOrigin of [
  PRODUCTION_API_ORIGIN,
  'https://api.mormorskunafa.se',
]) {
  await assert.rejects(
    loadDeploymentConfig({
      VERCEL_ENV: 'preview',
      PREVIEW_API_ORIGIN: productionOrigin,
    }),
    /must not target a known Production API origin/
  );
}
await assert.rejects(
  async () => createWebVercelConfig(
    {
      VERCEL_ENV: 'preview',
      PREVIEW_API_ORIGIN: 'https://legacy-production-api.example.se',
      PRODUCTION_API_ORIGINS: 'https://legacy-production-api.example.se',
    },
    ['https://legacy-production-api.example.se']
  ),
  /must not target a known Production API origin/
);
await assert.rejects(
  async () => createWebVercelConfig(
    {
      VERCEL_ENV: 'preview',
      PREVIEW_API_ORIGIN: 'https://mormors-kunafa-backend-git-main-example.vercel.app',
    },
    [previewOrigin]
  ),
  /not present in the committed approved Preview API origin allowlist/
);
for (const invalidOrigin of [
  'http://preview-api.example.test',
  'https://user:password@preview-api.example.test',
  'https://preview-api.example.test/api',
  'https://preview-api.example.test?environment=test',
  'https://127.0.0.1',
]) {
  await assert.rejects(
    loadDeploymentConfig({
      VERCEL_ENV: 'preview',
      PREVIEW_API_ORIGIN: invalidOrigin,
    }),
    /PREVIEW_API_ORIGIN must/
  );
}
await assert.rejects(
  loadDeploymentConfig({ VERCEL_ENV: 'staging' }),
  /VERCEL_ENV must be exactly production, preview, or development/
);

const rewrites = Array.isArray(config.rewrites) ? config.rewrites : [];
const apiIndex = rewrites.findIndex((rule) => rule.source === '/api/:path*');
const spaIndex = rewrites.findIndex(
  (rule) => rule.source === '/(.*)' && rule.destination === '/index.html'
);
if (apiIndex < 0 || spaIndex < 0 || apiIndex >= spaIndex || spaIndex !== rewrites.length - 1) {
  fail('API proxy must precede a final SPA fallback to /index.html');
}
if (rewrites[apiIndex].destination !== `${PRODUCTION_API_ORIGIN}/api/:path*`) {
  fail('Production /api must use the approved Production API origin');
}

const previewRewrite = previewConfig.rewrites.find((rule) => rule.source === '/api/:path*');
if (previewRewrite?.destination !== `${previewOrigin}/api/:path*`) {
  fail('Preview /api must use the explicitly configured isolated API origin');
}
const developmentRewrite = developmentConfig.rewrites.find((rule) => rule.source === '/api/:path*');
if (developmentRewrite?.destination !== 'http://127.0.0.1:3001/api/:path*') {
  fail('Development /api must stay on the loopback backend');
}

assert.deepEqual(config, createWebVercelConfig({ VERCEL_ENV: 'production' }));

const globalHeaders = (config.headers ?? []).find((rule) => rule.source === '/(.*)')?.headers ?? [];
const headerMap = new Map(globalHeaders.map((header) => [header.key.toLowerCase(), header.value]));
for (const required of [
  'content-security-policy',
  'strict-transport-security',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
  'cross-origin-opener-policy',
]) {
  if (!headerMap.has(required)) fail(`missing global ${required} header`);
}
const csp = headerMap.get('content-security-policy') ?? '';
for (const directive of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'"]) {
  if (!csp.includes(directive)) fail(`CSP is missing ${directive}`);
}
if (!String(headerMap.get('strict-transport-security')).includes('includeSubDomains')) {
  fail('HSTS must cover subdomains');
}

for (const source of ['/admin/(.*)', '/status', '/pay/(.*)']) {
  const cache = (config.headers ?? [])
    .find((rule) => rule.source === source)?.headers
    ?.find((header) => header.key.toLowerCase() === 'cache-control')?.value ?? '';
  if (!cache.includes('private') || !cache.includes('no-store')) {
    fail(`${source} must be private, no-store`);
  }
}

const appSource = await readFile(path.join(webRoot, 'src', 'App.tsx'), 'utf8');
for (const route of ['terms', 'privacy']) {
  if (!new RegExp(`<Route\\s+path=["']${route}["']`).test(appSource)) {
    fail(`/${route} is missing from the client router`);
  }
}

const sharedApiSource = await readFile(path.join(root, 'shared', 'api', 'index.ts'), 'utf8');
if (!/baseUrl:\s*viteProd\s*\?\s*['"]\/api['"]/.test(sharedApiSource)) {
  fail('Production browser API traffic must remain on same-origin /api');
}

const publicRoot = path.join(webRoot, 'public');
const [securityText, robotsText, sitemapText] = await Promise.all([
  readFile(path.join(publicRoot, '.well-known', 'security.txt'), 'utf8'),
  readFile(path.join(publicRoot, 'robots.txt'), 'utf8'),
  readFile(path.join(publicRoot, 'sitemap.xml'), 'utf8'),
]);
if (!/^Contact:\s*mailto:/m.test(securityText) || !/^Expires:\s*\d{4}-\d{2}-\d{2}T/m.test(securityText)) {
  fail('security.txt needs Contact and Expires fields');
}
if (!robotsText.includes('Sitemap: https://mormorskunafa.se/sitemap.xml')) {
  fail('robots.txt must identify the canonical sitemap');
}
for (const route of ['/terms', '/privacy']) {
  if (!sitemapText.includes(`<loc>https://mormorskunafa.se${route}</loc>`)) {
    fail(`${route} is missing from sitemap.xml`);
  }
}

console.log('Verified fail-closed Vercel environment rewrites, same-origin API, security headers, sensitive cache policy, legal routes and static security files.');
