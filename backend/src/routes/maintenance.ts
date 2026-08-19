import { Router, type Request, type Response } from 'express';
import { logSupabaseError, supabase } from '../db/connection.js';
import { requireMaintenanceAuthorization } from '../middleware/maintenanceAuth.js';
import { logUnexpectedError } from '../utils/safeErrorMetadata.js';
import { listInitiatedCheckoutDrafts } from '../db/checkoutDraftRepository.js';
import {
  reconcileInitiatedCheckoutDraft,
  type CheckoutDraftReconciliationOutcome,
} from '../services/checkoutDraftReconciliation.js';
import {
  anonymizeOperationalOrderPii,
  previewOperationalOrderPiiRetention,
} from '../db/orderPiiRetentionRepository.js';
import {
  operationalPiiCutoff,
  parseOperationalPiiRetentionRequest,
} from '../utils/orderPiiRetention.js';

const router = Router();
// The cron runs daily, so a 24-hour cutoff removes drafts after 24–48 hours.
const RETENTION_HOURS = 24;
const BATCH_SIZE = 500;
const MAX_BATCHES = 10;
const MAX_PROVIDER_RECONCILIATIONS = 40;
const PROVIDER_CONCURRENCY = 4;

type MaintenanceCounts = Record<CheckoutDraftReconciliationOutcome | 'errors', number>;

async function reconcileProviderDrafts(cutoff: string): Promise<MaintenanceCounts> {
  const drafts = await listInitiatedCheckoutDrafts(cutoff, MAX_PROVIDER_RECONCILIATIONS);
  const counts: MaintenanceCounts = {
    paid: 0,
    deleted: 0,
    pending: 0,
    rejected: 0,
    errors: 0,
  };
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < drafts.length) {
      const draft = drafts[cursor++];
      try {
        const outcome = await reconcileInitiatedCheckoutDraft(draft, cutoff);
        counts[outcome] += 1;
      } catch (error) {
        counts.errors += 1;
        logUnexpectedError('checkout draft provider reconciliation failed', error);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(PROVIDER_CONCURRENCY, drafts.length) }, () => worker())
  );
  return counts;
}

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

      const providerReconciliation = await reconcileProviderDrafts(cutoff);

      console.info('[maintenance] reconciled checkout drafts', {
        deletedUninitiated: deleted,
        batches,
        providerReconciliation,
      });
      res.setHeader('Cache-Control', 'private, no-store');
      res.json({
        ok: true,
        deletedUninitiated: deleted,
        providerReconciliation,
        retentionHours: RETENTION_HOURS,
      });
    } catch (error) {
      logUnexpectedError('cleanup uninitiated checkout drafts failed', error);
      res.status(500).json({ error: 'Cleanup failed' });
    }
  }
);

router.post(
  '/operational-order-pii-retention',
  requireMaintenanceAuthorization,
  async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const request = parseOperationalPiiRetentionRequest(req.body);
    if (!request) {
      res.status(400).json({
        error: 'retentionDays must be 30-3650, limit must be 1-500, and dryRun must be boolean',
      });
      return;
    }

    try {
      const cutoff = operationalPiiCutoff(request.retentionDays);
      if (request.dryRun) {
        const candidates = await previewOperationalOrderPiiRetention(cutoff, request.limit);
        res.json({
          ok: true,
          dryRun: true,
          cutoff,
          candidateCount: candidates.length,
          candidates,
        });
        return;
      }

      const anonymized = await anonymizeOperationalOrderPii(cutoff, request.limit);
      console.info('[maintenance] anonymized operational order PII', {
        anonymized,
        retentionDays: request.retentionDays,
      });
      res.json({ ok: true, dryRun: false, cutoff, anonymized });
    } catch (error) {
      logUnexpectedError('operational order PII retention failed', error);
      res.status(503).json({ error: 'Operational PII retention unavailable' });
    }
  }
);

export default router;
