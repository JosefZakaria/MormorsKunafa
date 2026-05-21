import type { Request, Response } from 'express';
import {
  getOrderIdBySwishInstructionId,
  markOrderPaid,
} from '../services/markOrderPaid.js';
import { parseSwishAmountToOre, type SwishCallbackPayload } from '../services/swishClient.js';

export async function handleSwishCallback(req: Request, res: Response): Promise<void> {
  try {
    const payload = req.body as SwishCallbackPayload;
    const instructionId = String(payload?.id ?? '').trim();
    const status = String(payload?.status ?? '').trim().toUpperCase();

    if (!instructionId) {
      res.status(400).send('Missing id');
      return;
    }

    if (status !== 'PAID') {
      res.status(200).send('OK');
      return;
    }

    const orderId = await getOrderIdBySwishInstructionId(instructionId);
    if (!orderId) {
      console.warn('[swish callback] no order for instruction', instructionId);
      res.status(200).send('OK');
      return;
    }

    const paidAmountOre =
      typeof payload.amount === 'number' ? parseSwishAmountToOre(payload.amount) : undefined;

    await markOrderPaid(orderId, { paidAmountOre });
    res.status(200).send('OK');
  } catch (e) {
    console.error('[swish callback] error', e);
    res.status(500).send('Callback handler failed');
  }
}
