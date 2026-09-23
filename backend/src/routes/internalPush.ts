import { timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { drainPushOutbox } from '../services/pushOutboxWorker.js';

const router = Router();

function authorized(req: Request): boolean {
  const secret = process.env.PUSH_WORKER_SECRET?.trim();
  const supplied = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : '';
  if (!secret || secret.length < 32 || !supplied) return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function handlePushDrain(req: Request, res: Response): Promise<void> {
  if (!authorized(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    res.json(await drainPushOutbox());
  } catch (error) {
    console.error('[push] Scheduled outbox drain failed', error);
    res.status(500).json({ error: 'Push worker failed' });
  }
}

router.post('/push/drain', handlePushDrain);

export default router;
