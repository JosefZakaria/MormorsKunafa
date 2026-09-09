import type { NextFunction, Request, Response } from 'express';
import {
  CHECKOUT_CONTRACT_VERSION,
  CLIENT_UPGRADE_REQUIRED_CODE,
  CLIENT_UPGRADE_REQUIRED_MESSAGE,
} from '../shared/constants/checkoutContract.js';

export function isCurrentCheckoutContract(value: unknown): boolean {
  return value === CHECKOUT_CONTRACT_VERSION;
}

/** Reject cached purchase clients before rate limits, persistence or providers. */
export function requireCurrentCheckoutContract(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (isCurrentCheckoutContract(req.headers['x-checkout-contract'])) {
    next();
    return;
  }

  res.setHeader('Cache-Control', 'private, no-store');
  res.status(426).json({
    code: CLIENT_UPGRADE_REQUIRED_CODE,
    error: CLIENT_UPGRADE_REQUIRED_MESSAGE,
  });
}
