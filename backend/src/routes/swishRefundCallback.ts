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
      // No reserved refund matches this identifier. Historical reservations
      // are recovered only after canonical provider verification.
      res.status(202).json({ received: true });
      return;
    }
    res.json({ received: true, status });
  } catch (error) {
    logUnexpectedError('Swish refund callback reconciliation failed', error);
    res.status(500).json({ error: 'Refund callback reconciliation failed' });
  }
}
