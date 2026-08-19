import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const MINIMUM_SECRET_BYTES = 32;

export function validMaintenanceAuthorization(
  authorization: unknown,
  configuredSecret = process.env.CRON_SECRET?.trim() ?? ''
): boolean {
  if (Buffer.byteLength(configuredSecret, 'utf8') < MINIMUM_SECRET_BYTES) return false;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false;

  const supplied = authorization.slice('Bearer '.length).trim();
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(configuredSecret);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

export function requireMaintenanceAuthorization(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!validMaintenanceAuthorization(req.headers.authorization)) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
