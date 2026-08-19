import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const webRoot = path.join(root, 'apps', 'web');
const fail = (message) => { throw new Error(`[web deployment] ${message}`); };

const config = JSON.parse(await readFile(path.join(webRoot, 'vercel.json'), 'utf8'));
const rewrites = Array.isArray(config.rewrites) ? config.rewrites : [];
const apiIndex = rewrites.findIndex((rule) => rule.source === '/api/:path*');
const spaIndex = rewrites.findIndex(
  (rule) => rule.source === '/(.*)' && rule.destination === '/index.html'
);
if (apiIndex < 0 || spaIndex < 0 || apiIndex >= spaIndex || spaIndex !== rewrites.length - 1) {
  fail('API proxy must precede a final SPA fallback to /index.html');
}

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

console.log('Verified Vercel rewrites, security headers, sensitive cache policy, legal routes and static security files.');
