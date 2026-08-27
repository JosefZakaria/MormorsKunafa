import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const secret = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';

export interface JwtPayload {
  adminId: string;
  email: string;
}

export function verifyAdminToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, secret) as JwtPayload;
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
  try {
    const decoded = readAdminFromRequest(req);
    if (!decoded) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    (req as Request & { admin?: JwtPayload }).admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}
