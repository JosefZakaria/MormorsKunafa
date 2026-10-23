import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AdminRole } from '@mormors-kunafa/shared/types';
import { AdminAccessDeniedError, loadAdminScope, parseAdminRole } from '../services/locationScope.js';

function jwtSecret(): string | null {
  const secret = process.env.JWT_SECRET?.trim();
  return secret && secret.length >= 32 && secret !== 'dev-secret-change-in-production' ? secret : null;
}

export function isJwtConfigured(): boolean {
  return jwtSecret() !== null;
}

export interface JwtPayload {
  adminId: string;
  email: string;
  role?: AdminRole;
  locationId?: string | null;
}

export function getRequestAdmin(req: Request): JwtPayload | undefined {
  return (req as Request & { admin?: JwtPayload }).admin;
}

export function verifyAdminToken(token: string): JwtPayload | null {
  try {
    const secret = jwtSecret();
    if (!secret) return null;
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || typeof decoded.adminId !== 'string' || !decoded.adminId.trim()
      || typeof decoded.email !== 'string' || !decoded.email.trim()) return null;
    return {
      adminId: decoded.adminId,
      email: decoded.email,
      role: decoded.role === undefined ? undefined : parseAdminRole(decoded.role),
      locationId: typeof decoded.locationId === 'string' ? decoded.locationId : null,
    };
  } catch {
    return null;
  }
}

export function readAdminFromRequest(req: Request): JwtPayload | null {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  return verifyAdminToken(token);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    try {
      if (!isJwtConfigured()) {
        res.status(503).json({ error: 'Admin authentication is not configured' });
        return;
      }
      const decoded = readAdminFromRequest(req);
      if (!decoded) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const scope = await loadAdminScope(decoded.adminId);
      (req as Request & { admin?: JwtPayload }).admin = {
        ...decoded, role: scope.role, locationId: scope.locationId,
      };
      next();
    } catch (error) {
      if (error instanceof AdminAccessDeniedError) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      console.error('[requireAdmin] account verification failed');
      res.status(503).json({ error: 'Admin authentication is temporarily unavailable' });
    }
  })();
}

/** Must run after requireAdmin. Checks live role in the database (not only JWT). */
export function requireOwner(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    try {
      const admin = getRequestAdmin(req);
      if (!admin) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const scope = await loadAdminScope(admin.adminId);
      if (scope.role !== 'owner') {
        res.status(403).json({ error: 'Endast ägare har åtkomst.' });
        return;
      }
      next();
    } catch (e) {
      if (e instanceof AdminAccessDeniedError) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      console.error('[requireOwner]', e);
      res.status(500).json({ error: 'Failed to verify access' });
    }
  })();
}

export function signToken(payload: JwtPayload): string {
  const secret = jwtSecret();
  if (!secret) throw new Error('JWT_SECRET must be configured with at least 32 characters');
  return jwt.sign(payload, secret, { expiresIn: '7d', algorithm: 'HS256' });
}
