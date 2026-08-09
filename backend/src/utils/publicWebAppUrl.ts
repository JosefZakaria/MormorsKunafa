const PRODUCTION_SITE_DEFAULT = 'https://mormorskunafa.se';

function isLocalhostUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

function isProductionRuntime(): boolean {
  return process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
}

export function normalizePublicWebAppOrigin(
  value: unknown,
  production = isProductionRuntime()
): string | null {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 2_048) return null;
  try {
    const url = new URL(raw);
    const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname.toLowerCase());
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && !production)) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== '/' && url.pathname !== '') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function normalizePublicHttpsAssetUrl(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 4_096) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Public frontend base URL for Stripe redirects, emails, etc.
 * Priority: PUBLIC_WEB_APP_URL → FRONTEND_URL → SITE_PUBLIC_URL → dev localhost.
 */
export function getPublicWebAppUrl(): string {
  const candidates = [
    { key: 'PUBLIC_WEB_APP_URL', value: process.env.PUBLIC_WEB_APP_URL },
    { key: 'FRONTEND_URL', value: process.env.FRONTEND_URL },
    { key: 'SITE_PUBLIC_URL', value: process.env.SITE_PUBLIC_URL },
  ];

  for (const { value } of candidates) {
    const normalized = normalizePublicWebAppOrigin(value);
    if (normalized) return normalized;
  }

  if (isProductionRuntime()) {
    console.error(
      '[publicWebAppUrl] Missing PUBLIC_WEB_APP_URL (or FRONTEND_URL) in production — ' +
        `falling back to ${PRODUCTION_SITE_DEFAULT}. Set env on Vercel and redeploy.`
    );
    return PRODUCTION_SITE_DEFAULT;
  }

  return 'http://localhost:5173';
}

export function getPublicWebAppUrlDiagnostics(): {
  effectiveUrl: string;
  isProduction: boolean;
  configuredPublicWebAppUrl: string | null;
  configuredFrontendUrl: string | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  const pub = process.env.PUBLIC_WEB_APP_URL?.trim() || null;
  const front = process.env.FRONTEND_URL?.trim() || null;
  const prod = isProductionRuntime();

  if (prod) {
    if (!pub && !front) {
      warnings.push('PUBLIC_WEB_APP_URL and FRONTEND_URL are unset — Stripe redirects use fallback domain.');
    } else if (pub && isLocalhostUrl(pub)) {
      warnings.push('PUBLIC_WEB_APP_URL points to localhost in production.');
    } else if (pub && !normalizePublicWebAppOrigin(pub, true)) {
      warnings.push('PUBLIC_WEB_APP_URL is not a clean HTTPS origin.');
    }
    if (!process.env.STRIPE_WEBHOOK_SECRET?.trim()) {
      warnings.push('STRIPE_WEBHOOK_SECRET is unset — card payments may stay "pending" until manual fix.');
    }
  }

  return {
    effectiveUrl: getPublicWebAppUrl(),
    isProduction: prod,
    configuredPublicWebAppUrl: pub,
    configuredFrontendUrl: front,
    warnings,
  };
}
