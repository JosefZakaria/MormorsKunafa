import type { Request, Response, NextFunction } from 'express';
import type { AdminRole } from '@mormors-kunafa/shared/types';
import { AdminAccessDeniedError, loadAdminScope } from '../services/locationScope.js';
import { readAdminSession, validAdminCsrf, type AdminSession } from '../services/adminSessions.js';

function jwtSecret(): string | null {
  const secret = process.env.JWT_SECRET?.trim();
  return secret && secret.length >= 32 && secret !== 'dev-secret-change-in-production' ? secret : null;
}

export function isJwtConfigured(): boolean {
  return jwtSecret() !== null;
}

export interface AdminIdentity {
  adminId: string;
  email: string;
  role?: AdminRole;
  locationId?: string | null;
  session?: AdminSession;
}

export function getRequestAdmin(req: Request): AdminIdentity | undefined {
  return (req as Request & { admin?: AdminIdentity }).admin;
}

export async function readAdminFromRequest(req: Request): Promise<AdminIdentity | null> {
  const session = await readAdminSession(req);
  if (!session) return null;
  const scope = await loadAdminScope(session.admin_id);
  return { adminId: session.admin_id, email: session.email, role: scope.role, locationId: scope.locationId, session };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    try {
      if (!isJwtConfigured()) {
        res.status(503).json({ error: 'Admin authentication is not configured' });
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      const decoded = await readAdminFromRequest(req);
      if (!decoded) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !validAdminCsrf(req)) {
        res.status(403).json({ error: 'Ogiltig säkerhetskontroll. Ladda om sidan och försök igen.' });
        return;
      }
      (req as Request & { admin?: AdminIdentity }).admin = decoded;
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
