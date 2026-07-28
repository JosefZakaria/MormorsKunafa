import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[SECURITY FATAL] JWT_SECRET environment variable is missing in production!');
    }
    console.warn('[SECURITY WARNING] JWT_SECRET is not set. Using dev fallback key. Set JWT_SECRET in production!');
    return 'dev-secret-change-in-production';
  }
  return secret;
}

export interface JwtPayload {
  adminId: string;
  email: string;
}

export function verifyAdminToken(token: string): JwtPayload | null {
  try {
    const secret = getJwtSecret();
    return jwt.verify(token, secret) as JwtPayload;
  } catch {
    return null;
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
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
    (req as Request & { admin?: JwtPayload }).admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function signToken(payload: JwtPayload): string {
  const secret = getJwtSecret();
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

