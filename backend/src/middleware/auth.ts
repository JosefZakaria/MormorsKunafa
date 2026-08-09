import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'node:crypto';
import { supabase, type Row, logSupabaseError } from '../db/connection.js';
import { logUnexpectedError } from '../utils/safeErrorMetadata.js';

const JWT_ISSUER = 'mormors-kunafa-backend';
const JWT_AUDIENCE = 'mormors-kunafa-admin';
const MINIMUM_SECRET_BYTES = 32;
const ADMIN_SESSION_COOKIE = 'mk_admin_session';
const CSRF_COOKIE = 'mk_csrf';
const SESSION_MAX_AGE_SECONDS = 30 * 60;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim() ?? '';
  if (Buffer.byteLength(secret, 'utf8') < MINIMUM_SECRET_BYTES) {
    throw new Error(
      `[SECURITY FATAL] JWT_SECRET must be configured with at least ${MINIMUM_SECRET_BYTES} bytes`
    );
  }
  return secret;
}

export function assertJwtConfiguration(): void {
  getJwtSecret();
}

export interface JwtPayload {
  adminId: string;
  email: string;
}

export function verifyAdminToken(token: string): JwtPayload | null {
  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (
      typeof decoded === 'string' ||
      typeof decoded.adminId !== 'string' ||
      !decoded.adminId ||
      typeof decoded.email !== 'string' ||
      !decoded.email
    ) {
      return null;
    }
    return { adminId: decoded.adminId, email: decoded.email };
  } catch {
    return null;
  }
}

function parseCookies(req: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      // Ignore malformed cookie values.
    }
  }
  return cookies;
}

function secureCookieSuffix(): string {
  const secure = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL_ENV);
  return `Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; SameSite=Strict${secure ? '; Secure' : ''}`;
}

export function createAdminSessionCookies(token: string, csrfToken: string): string[] {
  const suffix = secureCookieSuffix();
  return [
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; ${suffix}; HttpOnly`,
    `${CSRF_COOKIE}=${encodeURIComponent(csrfToken)}; ${suffix}`,
  ];
}

export function clearAdminSessionCookies(): string[] {
  const secure = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL_ENV);
  const suffix = `Path=/; Max-Age=0; SameSite=Strict${secure ? '; Secure' : ''}`;
  return [
    `${ADMIN_SESSION_COOKIE}=; ${suffix}; HttpOnly`,
    `${CSRF_COOKIE}=; ${suffix}`,
  ];
}

export function verifyCsrfTokens(cookieToken?: string, headerToken?: string): boolean {
  if (!cookieToken || !headerToken) return false;
  const cookieBuffer = Buffer.from(cookieToken);
  const headerBuffer = Buffer.from(headerToken);
  return cookieBuffer.length === headerBuffer.length && timingSafeEqual(cookieBuffer, headerBuffer);
}

function getAdminToken(req: Request): string | null {
  const cookieToken = parseCookies(req).get(ADMIN_SESSION_COOKIE);
  if (cookieToken) return cookieToken;
  const auth = req.headers.authorization;
  return auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null;
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = getAdminToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const decoded = verifyAdminToken(token);
    if (!decoded) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    const { data: admin, error } = await supabase
      .from('admin_users')
      .select('id, email')
      .eq('id', decoded.adminId)
      .eq('email', decoded.email)
      .maybeSingle();
    if (error) {
      logSupabaseError('requireAdmin', error);
      res.status(503).json({ error: 'Authentication service unavailable' });
      return;
    }
    if (!admin || String((admin as Row).id) !== decoded.adminId) {
      res.status(401).json({ error: 'Admin account is no longer valid' });
      return;
    }

    (req as Request & { admin?: JwtPayload }).admin = decoded;
    res.setHeader('Cache-Control', 'private, no-store');
    next();
  } catch (error) {
    logUnexpectedError('requireAdmin authentication failed', error);
    res.status(503).json({ error: 'Authentication service unavailable' });
  }
}

export function requireCsrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
    next();
    return;
  }
  if (req.method.toUpperCase() === 'POST' && req.path === '/login') {
    next();
    return;
  }

  const cookies = parseCookies(req);
  // Bearer-authenticated non-browser clients are not vulnerable to cookie CSRF.
  if (!cookies.has(ADMIN_SESSION_COOKIE)) {
    next();
    return;
  }
  const header = req.headers['x-csrf-token'];
  const headerToken = Array.isArray(header) ? header[0] : header;
  if (!verifyCsrfTokens(cookies.get(CSRF_COOKIE), headerToken)) {
    res.status(403).json({ error: 'CSRF validation failed' });
    return;
  }
  next();
}

export function signToken(payload: JwtPayload): string {
  const secret = getJwtSecret();
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: '30m',
  });
}

