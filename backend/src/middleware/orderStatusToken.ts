import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';

const TOKEN_VERSION = 'v1';
const TOKEN_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

function getSigningSecret(): string {
  const secret = process.env.JWT_SECRET?.trim() ?? '';
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('[SECURITY FATAL] JWT_SECRET must be at least 32 bytes for order status tokens');
  }
  return secret;
}

function signature(orderId: string, expiresAt: string, nonce: string): string {
  return createHmac('sha256', getSigningSecret())
    .update(`order-status\0${orderId}\0${expiresAt}\0${nonce}`)
    .digest('base64url');
}

export function createOrderStatusToken(orderId: string): string {
  const expiresAt = String(Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS);
  const nonce = randomBytes(16).toString('base64url');
  return `${TOKEN_VERSION}.${expiresAt}.${nonce}.${signature(orderId, expiresAt, nonce)}`;
}

export function verifyOrderStatusToken(orderId: string, token: string): boolean {
  const [version, expiresAt, nonce, suppliedSignature, ...extra] = token.split('.');
  if (
    extra.length > 0 ||
    version !== TOKEN_VERSION ||
    !/^\d{10}$/.test(expiresAt ?? '') ||
    !/^[A-Za-z0-9_-]{22}$/.test(nonce ?? '') ||
    !suppliedSignature
  ) {
    return false;
  }
  if (Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;

  const expected = Buffer.from(signature(orderId, expiresAt, nonce));
  const supplied = Buffer.from(suppliedSignature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function requireOrderStatusToken(req: Request, res: Response, orderId: string): boolean {
  const header = req.headers['x-order-status-token'];
  const token = Array.isArray(header) ? header[0] : header;
  if (!token || !verifyOrderStatusToken(orderId, token)) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(401).json({ error: 'Invalid or expired order status token' });
    return false;
  }
  return true;
}
