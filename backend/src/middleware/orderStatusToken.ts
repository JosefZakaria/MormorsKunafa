import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { logSupabaseError, supabase, type Row } from '../db/connection.js';

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

export function hashOrderStatusToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

export function createOrderStatusToken(
  orderId: string,
  now = Date.now()
): { token: string; tokenHash: string; expiresAt: string } {
  const expiresAtSeconds = String(Math.floor(now / 1000) + TOKEN_LIFETIME_SECONDS);
  const nonce = randomBytes(16).toString('base64url');
  const token = `${TOKEN_VERSION}.${expiresAtSeconds}.${nonce}.${signature(orderId, expiresAtSeconds, nonce)}`;
  return {
    token,
    tokenHash: hashOrderStatusToken(token),
    expiresAt: new Date(Number(expiresAtSeconds) * 1000).toISOString(),
  };
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

export function verifyStoredOrderStatusToken(
  orderId: string,
  token: string,
  storedHash: unknown,
  storedExpiresAt: unknown,
  now = Date.now()
): boolean {
  if (!verifyOrderStatusToken(orderId, token)) return false;
  const hash = typeof storedHash === 'string' ? storedHash : '';
  const expiresAt = new Date(String(storedExpiresAt ?? '')).getTime();
  if (!/^[A-Za-z0-9_-]{43}$/.test(hash) || !Number.isFinite(expiresAt) || expiresAt <= now) {
    return false;
  }
  const expected = Buffer.from(hashOrderStatusToken(token));
  const supplied = Buffer.from(hash);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function requireOrderStatusToken(
  req: Request,
  res: Response,
  orderId: string
): Promise<boolean> {
  const header = req.headers['x-order-status-token'];
  const token = Array.isArray(header) ? header[0] : header;
  if (!token || !verifyOrderStatusToken(orderId, token)) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(401).json({ error: 'Invalid or expired order status token' });
    return false;
  }

  const { data, error } = await supabase
    .from('orders')
    .select('order_status_token_hash, order_status_token_expires_at')
    .eq('id', orderId)
    .maybeSingle();
  if (error) {
    logSupabaseError('requireOrderStatusToken', error);
    res.status(503).json({ error: 'Order status authentication unavailable' });
    return false;
  }
  if (
    !data ||
    !verifyStoredOrderStatusToken(
      orderId,
      token,
      (data as Row).order_status_token_hash,
      (data as Row).order_status_token_expires_at
    )
  ) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(401).json({ error: 'Invalid, expired or revoked order status token' });
    return false;
  }
  return true;
}
