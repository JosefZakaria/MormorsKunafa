import { Router, type Request, type Response } from 'express';
import { supabase } from '../db/connection.js';
import { isSiteMediaPath } from '../utils/siteMediaUrl.js';
import { SITE_MEDIA_BUCKET, SITE_MEDIA_MAX_BYTES, sniffImageKind, contentTypeForKind } from '../services/siteMedia.js';
import { logUnexpectedError } from '../utils/safeErrorMetadata.js';

const router = Router();
// Same-origin public image delivery keeps the storefront CSP narrow.
router.get('/*', async (req: Request, res: Response) => {
  const path = req.params[0];
  if (!isSiteMediaPath(path)) { res.status(404).end(); return; }
  try {
    const { data, error } = await supabase.storage.from(SITE_MEDIA_BUCKET).download(path);
    if (error || !data || data.size > SITE_MEDIA_MAX_BYTES) { res.status(404).end(); return; }
    const buffer = Buffer.from(await data.arrayBuffer());
    const kind = sniffImageKind(buffer);
    if (!kind) { res.status(404).end(); return; }
    res.setHeader('Content-Type', contentTypeForKind(kind));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  } catch (error) {
    logUnexpectedError('site media download', error);
    res.status(502).end();
  }
});
export default router;
