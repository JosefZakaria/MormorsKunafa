import type { Request, Response } from 'express';
import {
  getOrderIdBySwishInstructionId,
  markOrderPaid,
} from '../services/markOrderPaid.js';
import {
  getSwishPaymentRequest,
  parseSwishInstructionId,
  verifySwishPaymentRequest,
  type SwishCallbackPayload,
} from '../services/swishClient.js';
import { fetchOrderRow } from '../db/orderRepository.js';
import { logUnexpectedError } from '../utils/safeErrorMetadata.js';

export async function handleSwishCallback(req: Request, res: Response): Promise<void> {
  try {
    const payload = req.body as SwishCallbackPayload;
    const instructionId = parseSwishInstructionId(payload?.id);
    const status = String(payload?.status ?? '').trim().toUpperCase();

    if (!instructionId) {
      res.status(400).send('Invalid id');
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

    const order = await fetchOrderRow(orderId);
    if (!order) {
      res.status(200).send('OK');
      return;
    }

    // Callback bodies are notifications, not proof of payment. Fetch the
    // canonical payment from Swish over our authenticated mTLS connection.
    const payment = await getSwishPaymentRequest(instructionId);
    const verification = verifySwishPaymentRequest(payment, {
      instructionId,
      amountOre: Number(order.total_ore ?? 0),
      payeeAlias: process.env.SWISH_PAYEE_ALIAS?.trim() ?? '',
      payeePaymentReference: orderId.slice(0, 35),
    });
    if (!verification.ok) {
      console.error('[swish callback] verification failed', {
        instructionId,
        reason: verification.reason,
      });
      res.status(409).send('Payment verification failed');
      return;
    }

    await markOrderPaid(orderId, { paidAmountOre: verification.paidAmountOre });
    res.status(200).send('OK');
  } catch (e) {
    logUnexpectedError('swish callback error', e);
    res.status(500).send('Callback handler failed');
  }
}
