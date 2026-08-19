import { Router, type Request, type Response } from 'express';
import { logSupabaseError, supabase } from '../db/connection.js';
import { requireMaintenanceAuthorization } from '../middleware/maintenanceAuth.js';
import { logUnexpectedError } from '../utils/safeErrorMetadata.js';

const router = Router();
// The cron runs daily, so a 24-hour cutoff removes drafts after 24–48 hours.
const RETENTION_HOURS = 24;
const BATCH_SIZE = 500;
const MAX_BATCHES = 10;

router.get(
  '/cleanup-uninitiated-checkout-drafts',
  requireMaintenanceAuthorization,
  async (_req: Request, res: Response) => {
    try {
      const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000).toISOString();
      let deleted = 0;
      let batches = 0;

      while (batches < MAX_BATCHES) {
        const { data, error } = await supabase.rpc('cleanup_uninitiated_checkout_drafts', {
          p_before: cutoff,
          p_limit: BATCH_SIZE,
        });
        if (error) {
          logSupabaseError('cleanup uninitiated checkout drafts', error);
          res.status(503).json({ error: 'Cleanup unavailable' });
          return;
        }

        const batchDeleted = Number(data);
        if (!Number.isSafeInteger(batchDeleted) || batchDeleted < 0 || batchDeleted > BATCH_SIZE) {
          throw new Error('Cleanup returned an invalid deletion count');
        }
        deleted += batchDeleted;
        batches += 1;
        if (batchDeleted < BATCH_SIZE) break;
      }

      console.info('[maintenance] removed uninitiated checkout drafts', { deleted, batches });
      res.setHeader('Cache-Control', 'private, no-store');
      res.json({ ok: true, deleted, retentionHours: RETENTION_HOURS });
    } catch (error) {
      logUnexpectedError('cleanup uninitiated checkout drafts failed', error);
      res.status(500).json({ error: 'Cleanup failed' });
    }
  }
);

export default router;
