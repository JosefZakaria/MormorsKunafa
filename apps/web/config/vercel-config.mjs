import { isIP } from 'node:net';

export const PRODUCTION_API_ORIGIN = 'https://mormors-kunafa-backend.vercel.app';
export const APPROVED_PREVIEW_API_ORIGINS = Object.freeze([
  // Add an exact origin only after its database, Upstash and provider resources
  // have been independently verified as non-Production and the change reviewed.
]);

const DEVELOPMENT_API_ORIGIN = 'http://127.0.0.1:3001';
const KNOWN_PRODUCTION_API_ORIGINS = [
  PRODUCTION_API_ORIGIN,
  'https://api.mormorskunafa.se',
];

const fail = (message) => {
  throw new Error(`[web deployment] ${message}`);
};

function parseHttpsOrigin(name, value) {
  if (typeof value !== 'string' || !value.trim()) {
    fail(`${name} must be an explicit HTTPS origin without a path`);
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    fail(`${name} must be a valid HTTPS origin without a path`);
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    fail(`${name} must be a clean HTTPS origin without credentials, path, query, or fragment`);
  }

  const hostname = parsed.hostname.toLowerCase();
  const unbracketedHostname = hostname.replace(/^\[|\]$/g, '');
  if (
    hostname.endsWith('.') ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    isIP(unbracketedHostname) !== 0
  ) {
    fail(`${name} must use a public DNS hostname`);
  }

  return parsed.origin;
}

function productionApiOrigins(env) {
  const configured = String(env.PRODUCTION_API_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => parseHttpsOrigin('PRODUCTION_API_ORIGINS', value));

  return new Set([...KNOWN_PRODUCTION_API_ORIGINS, ...configured]);
}

export function resolveWebApiOrigin(env, approvedPreviewOrigins = APPROVED_PREVIEW_API_ORIGINS) {
  const deploymentEnvironment = String(env.VERCEL_ENV ?? '').trim();

  if (deploymentEnvironment === 'production') return PRODUCTION_API_ORIGIN;
  if (deploymentEnvironment === 'development') return DEVELOPMENT_API_ORIGIN;

  if (deploymentEnvironment === 'preview') {
    const previewOrigin = parseHttpsOrigin('PREVIEW_API_ORIGIN', env.PREVIEW_API_ORIGIN);
    if (productionApiOrigins(env).has(previewOrigin)) {
      fail('PREVIEW_API_ORIGIN must not target a known Production API origin');
    }
    const approvedOrigins = new Set(
      approvedPreviewOrigins.map((origin) => parseHttpsOrigin('APPROVED_PREVIEW_API_ORIGINS', origin))
    );
    if (!approvedOrigins.has(previewOrigin)) {
      fail('PREVIEW_API_ORIGIN is not present in the committed approved Preview API origin allowlist');
    }
    return previewOrigin;
  }

  fail('VERCEL_ENV must be exactly production, preview, or development');
}

export function createWebVercelConfig(env, approvedPreviewOrigins = APPROVED_PREVIEW_API_ORIGINS) {
  const apiOrigin = resolveWebApiOrigin(env, approvedPreviewOrigins);

  return {
    framework: 'vite',
    installCommand: 'cd ../.. && npm ci',
    buildCommand: 'npm run build',
    ignoreCommand: 'git diff HEAD^ HEAD --quiet -- . ../../shared ../../package.json ../../package-lock.json',
    outputDirectory: 'dist',
    headers: [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: https://mormorskunafa.se https://www.mormorskunafa.se; connect-src 'self'; frame-src 'none'; manifest-src 'self'; worker-src 'self'; upgrade-insecure-requests",
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
      {
        source: '/admin/(.*)',
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/status',
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
      },
      {
        source: '/pay/(.*)',
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
      },
    ],
    rewrites: [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
      { source: '/(.*)', destination: '/index.html' },
    ],
  };
}
