import type { Request, Response } from 'express';
import { reconcileSwishRefundCallback } from '../services/refundReconciliation.js';
import { parseSwishRefundId } from '../services/swishClient.js';
import { logUnexpectedError } from '../utils/safeErrorMetadata.js';

export async function handleSwishRefundCallback(req: Request, res: Response): Promise<void> {
  const refundId = parseSwishRefundId(req.body?.id);
  if (!refundId) {
    res.status(400).json({ error: 'Invalid refund callback' });
    return;
  }
  try {
    const status = await reconcileSwishRefundCallback(refundId);
    if (status === 'unknown') {
      // Do not reveal whether an attacker-guessed identifier exists. A genuine
      // callback can be reconciled from the admin UI after the create response
      // has stored its provider identifier.
      res.status(202).json({ received: true });
      return;
    }
    res.json({ received: true, status });
  } catch (error) {
    logUnexpectedError('Swish refund callback reconciliation failed', error);
    res.status(500).json({ error: 'Refund callback reconciliation failed' });
  }
}
