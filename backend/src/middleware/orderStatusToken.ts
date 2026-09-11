import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { logSupabaseError, supabase, type Row } from '../db/connection.js';

const TOKEN_VERSION = 'v2';
const LEGACY_TOKEN_VERSION = 'v1';
const TOKEN_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

function getLegacySigningSecret(): string {
  const secret = process.env.JWT_SECRET?.trim() ?? '';
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('[SECURITY FATAL] JWT_SECRET must be at least 32 bytes for order status tokens');
  }
  return secret;
}

function getDedicatedSigningSecret(): string | null {
  const secret = process.env.ORDER_STATUS_TOKEN_SECRET?.trim() ?? '';
  if (!secret) return null;
  if (Buffer.byteLength(secret, 'utf8') < 32 || secret === process.env.JWT_SECRET?.trim()) {
    throw new Error('[SECURITY FATAL] ORDER_STATUS_TOKEN_SECRET must be at least 32 bytes and differ from JWT_SECRET');
  }
  return secret;
}

export function assertOrderStatusTokenConfiguration(): void {
  const secret = getDedicatedSigningSecret();
  if (process.env.VERCEL_ENV === 'preview' && !secret) {
    throw new Error('[SECURITY FATAL] Preview requires an independent ORDER_STATUS_TOKEN_SECRET');
  }
}

function signature(version: string, orderId: string, expiresAt: string, nonce: string): string {
  const secret = version === LEGACY_TOKEN_VERSION ? getLegacySigningSecret() : getDedicatedSigningSecret();
  if (!secret) throw new Error('Order status signing key is unavailable');
  const domain = version === LEGACY_TOKEN_VERSION ? 'order-status' : 'order-status-v2';
  return createHmac('sha256', secret)
    .update(`${domain}\0${orderId}\0${expiresAt}\0${nonce}`)
    .digest('base64url');
}

export function hashOrderStatusToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

export function createOrderStatusToken(
  orderId: string,
  now = Date.now(),
  scheduledAt?: Date | null
): { token: string; tokenHash: string; expiresAt: string } {
  assertOrderStatusTokenConfiguration();
  const version = getDedicatedSigningSecret() ? TOKEN_VERSION : LEGACY_TOKEN_VERSION;
  const scheduledMs = scheduledAt?.getTime() ?? now;
  if (!Number.isFinite(scheduledMs) || scheduledMs > now + 31 * 24 * 60 * 60 * 1000) {
    throw new Error('Order status token schedule exceeds the supported booking window');
  }
  const expiresAtSeconds = String(Math.floor(Math.max(now, scheduledMs) / 1000) + TOKEN_LIFETIME_SECONDS);
  const nonce = randomBytes(16).toString('base64url');
  const token = `${version}.${expiresAtSeconds}.${nonce}.${signature(version, orderId, expiresAtSeconds, nonce)}`;
  return {
    token,
    tokenHash: hashOrderStatusToken(token),
    expiresAt: new Date(Number(expiresAtSeconds) * 1000).toISOString(),
  };
}

/** Signature precheck only. Authorization always also requires the stored hash and expiry. */
export function verifyOrderStatusToken(orderId: string, token: string): boolean {
  const [version, expiresAt, nonce, suppliedSignature, ...extra] = token.split('.');
  if (
    extra.length > 0 ||
    (version !== TOKEN_VERSION && version !== LEGACY_TOKEN_VERSION) ||
    !/^\d{10}$/.test(expiresAt ?? '') ||
    !/^[A-Za-z0-9_-]{22}$/.test(nonce ?? '') ||
    !suppliedSignature
  ) {
    return false;
  }
  if (Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;

  try {
    // v1 keeps the old JWT-derived signature. v2 never falls back to the JWT key.
    const expected = Buffer.from(signature(version, orderId, expiresAt, nonce));
    const supplied = Buffer.from(suppliedSignature);
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  } catch {
    return false;
  }
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
