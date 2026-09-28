const PRODUCTION_SITE_DEFAULT = 'https://mormorskunafa.se';
const PRODUCTION_WEB_ORIGINS = [PRODUCTION_SITE_DEFAULT, 'https://www.mormorskunafa.se'];

function isLocalhostUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

function isProductionRuntime(): boolean {
  return Boolean(process.env.VERCEL_ENV) || process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
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
    if (url.hostname.endsWith('.')) return null;
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

export function assertPublicUrlConfiguration(): void {
  if (!isProductionRuntime()) return;

  const preview = process.env.VERCEL_ENV === 'preview';
  const productionOrigins = new Set(PRODUCTION_WEB_ORIGINS);
  if (preview) {
    if (!normalizePublicWebAppOrigin(process.env.PUBLIC_WEB_APP_URL, true)) {
      throw new Error('Preview requires an explicit clean HTTPS PUBLIC_WEB_APP_URL');
    }
    for (const value of String(process.env.PRODUCTION_WEB_ORIGINS ?? '').split(',').filter(value => value.trim())) {
      const origin = normalizePublicWebAppOrigin(value, true);
      if (!origin) throw new Error('PRODUCTION_WEB_ORIGINS must contain only clean HTTPS origins');
      productionOrigins.add(origin);
    }
  }

  const originValues = [
    ['PUBLIC_WEB_APP_URL', process.env.PUBLIC_WEB_APP_URL],
    ['FRONTEND_URL', process.env.FRONTEND_URL],
    ['SITE_PUBLIC_URL', process.env.SITE_PUBLIC_URL],
    ...String(process.env.FRONTEND_URLS ?? '')
      .split(',')
      .map((value, index) => [`FRONTEND_URLS[${index}]`, value]),
  ] as const;

  for (const [label, value] of originValues) {
    if (String(value ?? '').trim() && !normalizePublicWebAppOrigin(value, true)) {
      throw new Error(`${label} must be a clean HTTPS origin without credentials, path, query or fragment`);
    }
    if (preview && productionOrigins.has(normalizePublicWebAppOrigin(value, true) ?? '')) {
      throw new Error(`${label} must not target a known Production web origin in Preview`);
    }
  }

  const logoUrl = process.env.ORDER_EMAIL_LOGO_URL;
  if (logoUrl?.trim() && !normalizePublicHttpsAssetUrl(logoUrl)) {
    throw new Error('ORDER_EMAIL_LOGO_URL must be a valid public HTTPS URL without credentials or fragment');
  }
}

/** Preview CORS is restricted to its explicit isolated frontend configuration. */
export function getAllowedFrontendOrigins(): string[] {
  const preview = process.env.VERCEL_ENV === 'preview';
  if (preview) assertPublicUrlConfiguration();
  const origins = new Set<string>(preview ? [] : PRODUCTION_WEB_ORIGINS);
  const values = [process.env.FRONTEND_URL, process.env.FRONTEND_URLS, process.env.PUBLIC_WEB_APP_URL];
  for (const value of values.filter(Boolean).join(',').split(',')) {
    const origin = normalizePublicWebAppOrigin(value);
    if (origin) origins.add(origin);
  }
  return [...origins];
}

/**
 * Public frontend base URL for Stripe redirects, emails, etc.
 * Priority: PUBLIC_WEB_APP_URL → FRONTEND_URL → SITE_PUBLIC_URL → dev localhost.
 */
export function getPublicWebAppUrl(): string {
  if (process.env.VERCEL_ENV === 'preview') {
    assertPublicUrlConfiguration();
    return normalizePublicWebAppOrigin(process.env.PUBLIC_WEB_APP_URL, true)!;
  }
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
