import sharp from 'sharp';
import { supabase } from '../db/supabase.js';

export const SITE_MEDIA_BUCKET = 'site-media';
export const SITE_MEDIA_MAX_BYTES = 4 * 1024 * 1024;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

let bucketReady = false;

export type ImageKind = 'jpg' | 'png' | 'webp';

export function sniffImageKind(buffer: Buffer): ImageKind | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export function isAllowedImageMime(mime: string | undefined): boolean {
  return Boolean(mime && ALLOWED_MIME.has(mime.toLowerCase()));
}

export function contentTypeForKind(kind: ImageKind): string {
  if (kind === 'png') return 'image/png';
  if (kind === 'webp') return 'image/webp';
  return 'image/jpeg';
}

// 1200 px covers a product card/modal on a 2x retina screen; phone photos arrive at ~4000 px.
export const PRODUCT_IMAGE_MAX_PX = 1200;
const PRODUCT_IMAGE_QUALITY = 80;
// Upload paths are timestamped and never overwritten, so a cached copy can never go stale.
const SITE_MEDIA_CACHE_SECONDS = String(365 * 24 * 60 * 60);

export async function compressProductImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate() // bake in EXIF orientation, since metadata is stripped
    .resize({ width: PRODUCT_IMAGE_MAX_PX, height: PRODUCT_IMAGE_MAX_PX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: PRODUCT_IMAGE_QUALITY })
    .toBuffer();
}

export function withCacheBuster(url: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${Date.now()}`;
}

export async function ensureSiteMediaBucket(): Promise<void> {
  if (bucketReady) return;

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(`Could not list storage buckets: ${listError.message}`);
  }
  if (buckets?.some((b) => b.id === SITE_MEDIA_BUCKET || b.name === SITE_MEDIA_BUCKET)) {
    bucketReady = true;
    return;
  }

  const { error } = await supabase.storage.createBucket(SITE_MEDIA_BUCKET, {
    public: true,
    fileSizeLimit: SITE_MEDIA_MAX_BYTES,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(
      `Could not create storage bucket "${SITE_MEDIA_BUCKET}": ${error.message}. Create it in the Supabase dashboard (public bucket).`
    );
  }
  bucketReady = true;
}

export async function uploadSiteMedia(params: {
  path: string;
  buffer: Buffer;
  contentType: string;
  upsert: boolean;
}): Promise<string> {
  await ensureSiteMediaBucket();

  const { error } = await supabase.storage.from(SITE_MEDIA_BUCKET).upload(params.path, params.buffer, {
    contentType: params.contentType,
    upsert: params.upsert,
    cacheControl: SITE_MEDIA_CACHE_SECONDS,
  });
  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(SITE_MEDIA_BUCKET).getPublicUrl(params.path);
  return withCacheBuster(data.publicUrl);
}
