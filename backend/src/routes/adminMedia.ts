import type { Request, Response, Router } from 'express';
import multer from 'multer';
import { generateId, logSupabaseError, nowIso, supabase, type Row } from '../db/connection.js';
import { rowToAdminSettings } from '../db/adminSettings.js';
import { requireAdmin, requireOwner } from '../middleware/auth.js';
import {
  SITE_MEDIA_MAX_BYTES,
  contentTypeForKind,
  isAllowedImageMime,
  sniffImageKind,
  uploadSiteMedia,
} from '../services/siteMedia.js';
import { PRODUCT_COLUMNS, rowToProduct } from './products.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SITE_MEDIA_MAX_BYTES },
});

const UPLOAD_KINDS = ['product', 'hero-desktop', 'hero-mobile'] as const;
type UploadKind = (typeof UPLOAD_KINDS)[number];

function isUploadKind(value: string): value is UploadKind {
  return (UPLOAD_KINDS as readonly string[]).includes(value);
}

function runMulter(req: Request, res: Response, next: () => void): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: string }).code) : '';
    if (code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'Image is too large (max 4 MB)' });
      return;
    }
    const message = err instanceof Error ? err.message : 'Upload failed';
    res.status(400).json({ error: message });
  });
}

async function fetchAdminSettingsRow(): Promise<Row | null> {
  const { data, error } = await supabase.from('admin_settings').select('*').limit(1).maybeSingle();
  if (error) {
    logSupabaseError('admin_settings', error);
    throw error;
  }
  return data as Row | null;
}

async function saveHeroUrl(which: 'desktop' | 'mobile', url: string): Promise<Row> {
  const settings = await fetchAdminSettingsRow();
  if (!settings?.id) {
    throw new Error('Settings not found');
  }
  const column = which === 'desktop' ? 'hero_image_desktop_url' : 'hero_image_mobile_url';
  const { error } = await supabase
    .from('admin_settings')
    .update({ [column]: url, updated_at: nowIso() })
    .eq('id', settings.id);
  if (error) {
    logSupabaseError('POST /admin/uploads hero', error);
    throw error;
  }
  const updated = await fetchAdminSettingsRow();
  if (!updated) {
    throw new Error('Settings not found');
  }
  return updated;
}

export function registerAdminMediaRoutes(router: Router): void {
  router.post('/uploads', requireAdmin, requireOwner, (req, res, next) => {
    runMulter(req, res, () => {
      void handleUpload(req, res).catch(next);
    });
  });
}

async function handleUpload(req: Request, res: Response): Promise<void> {
  const file = req.file;
  if (!file?.buffer?.length) {
    res.status(400).json({ error: 'file is required' });
    return;
  }

  const kindRaw = String(req.body?.kind ?? '').trim();
  if (!isUploadKind(kindRaw)) {
    res.status(400).json({ error: 'kind must be product, hero-desktop, or hero-mobile' });
    return;
  }

  if (!isAllowedImageMime(file.mimetype) && !sniffImageKind(file.buffer)) {
    res.status(400).json({ error: 'Only JPEG, PNG, and WebP images are allowed' });
    return;
  }

  const imageKind = sniffImageKind(file.buffer);
  if (!imageKind) {
    res.status(400).json({ error: 'File is not a valid JPEG, PNG, or WebP image' });
    return;
  }

  const productId = String(req.body?.productId ?? '').trim();
  const stamp = Date.now();
  let storagePath: string;
  if (kindRaw === 'hero-desktop') {
    storagePath = `hero/desktop-${stamp}.${imageKind}`;
  } else if (kindRaw === 'hero-mobile') {
    storagePath = `hero/mobile-${stamp}.${imageKind}`;
  } else {
    const folder = productId || generateId();
    storagePath = `products/${folder}/${stamp}.${imageKind}`;
  }

  try {
    const url = await uploadSiteMedia({
      path: storagePath,
      buffer: file.buffer,
      contentType: contentTypeForKind(imageKind),
      upsert: false,
    });

    if (kindRaw === 'hero-desktop' || kindRaw === 'hero-mobile') {
      const which = kindRaw === 'hero-desktop' ? 'desktop' : 'mobile';
      const settings = await saveHeroUrl(which, url);
      res.status(200).json({ url, settings: rowToAdminSettings(settings) });
      return;
    }

    if (productId) {
      const { data, error } = await supabase
        .from('products')
        .update({ image_url: url, updated_at: nowIso() })
        .eq('id', productId)
        .select(PRODUCT_COLUMNS)
        .maybeSingle();
      if (error) {
        logSupabaseError('POST /admin/uploads product', error);
        res.status(500).json({ error: 'Failed to update product image', details: error.message });
        return;
      }
      if (!data) {
        res.status(404).json({ error: 'Product not found' });
        return;
      }
      res.status(200).json({ url, product: rowToProduct(data as Row) });
      return;
    }

    res.status(200).json({ url });
  } catch (e) {
    console.error('[POST /admin/uploads]', e);
    const message = e instanceof Error ? e.message : 'Upload failed';
    res.status(500).json({ error: message });
  }
}
