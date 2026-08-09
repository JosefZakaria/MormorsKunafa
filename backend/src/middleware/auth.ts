import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabase, type Row, logSupabaseError } from '../db/connection.js';

const JWT_ISSUER = 'mormors-kunafa-backend';
const JWT_AUDIENCE = 'mormors-kunafa-admin';
const MINIMUM_SECRET_BYTES = 32;

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

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
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
    next();
  } catch (error) {
    console.error('[requireAdmin] authentication failed', error);
    res.status(503).json({ error: 'Authentication service unavailable' });
  }
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

