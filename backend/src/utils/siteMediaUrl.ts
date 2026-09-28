const MEDIA_PATH = /^(?:hero\/(?:desktop|mobile)-[0-9]+|products\/[A-Za-z0-9-]{1,64}\/[0-9]+)\.(?:jpg|png|webp)$/;

export function isSiteMediaPath(path: string): boolean {
  return MEDIA_PATH.test(path);
}

/** Accept only our bucket on the configured Supabase origin, never arbitrary URLs. */
export function normalizeSiteMediaUrl(value: unknown, supabaseUrl = process.env.SUPABASE_URL): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (raw.startsWith('/api/media/') && isSiteMediaPath(raw.slice(11))) return raw;
  try {
    const url = new URL(raw);
    const configured = new URL(supabaseUrl ?? '');
    const prefix = '/storage/v1/object/public/site-media/';
    if (url.origin !== configured.origin || url.protocol !== 'https:' || url.username || url.password
      || url.hash || !url.pathname.startsWith(prefix)) return null;
    const path = url.pathname.slice(prefix.length);
    return isSiteMediaPath(path) ? `/api/media/${path}` : null;
  } catch { return null; }
}
