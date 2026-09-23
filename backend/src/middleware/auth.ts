import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AdminRole } from '@mormors-kunafa/shared/types';
import { AdminScopeUnavailableError, loadAdminScope, parseAdminRole, type AdminScope } from '../services/locationScope.js';

const secret = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';

export interface JwtPayload {
  adminId: string;
  email: string;
  role?: AdminRole;
  locationId?: string | null;
}

export function getRequestAdmin(req: Request): JwtPayload | undefined {
  return (req as Request & { admin?: JwtPayload }).admin;
}

export function getRequestAdminScope(req: Request): AdminScope | undefined {
  return (req as Request & { adminScope?: AdminScope }).adminScope;
}

export function verifyAdminToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    if (!decoded?.adminId || !decoded?.email) return null;
    return {
      adminId: decoded.adminId,
      email: decoded.email,
      role: parseAdminRole(decoded.role),
      locationId: decoded.locationId ?? null,
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
    const decoded = readAdminFromRequest(req);
    if (!decoded) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const scope = await loadAdminScope(decoded.adminId);
      (req as Request & { admin?: JwtPayload; adminScope?: AdminScope }).admin = {
        ...decoded,
        role: scope.role,
        locationId: scope.locationId,
      };
      (req as Request & { adminScope?: AdminScope }).adminScope = scope;
      next();
    } catch (error) {
      if (error instanceof AdminScopeUnavailableError) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      console.error('[requireAdmin]', error);
      res.status(500).json({ error: 'Failed to verify access' });
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
      const scope = getRequestAdminScope(req) ?? await loadAdminScope(admin.adminId);
      if (scope.role !== 'owner') {
        res.status(403).json({ error: 'Endast ägare har åtkomst.' });
        return;
      }
      next();
    } catch (e) {
      console.error('[requireOwner]', e);
      res.status(500).json({ error: 'Failed to verify access' });
    }
  })();
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}
