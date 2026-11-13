import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { supabase } from '../db/connection.js';

const SESSION_MS = 16 * 60 * 60 * 1000;
const secureCookie = () => process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
const cookieName = () => secureCookie() ? '__Host-mk_admin' : 'mk_admin';
const cookieOptions = () => ({ httpOnly: true, secure: secureCookie(), sameSite: 'lax' as const, path: '/' });
export const sessionHash = (token: string): string => createHash('sha256').update(token).digest('hex');
const csrfToken = (token: string): string => createHmac('sha256', token).update('admin-csrf').digest('hex');

export interface AdminSession {
  token_hash: string;
  admin_id: string;
  email: string;
  name: string;
  expires_at: string;
}

function readCookie(req: Request): string | null {
  const values = (req.headers.cookie ?? '').split(';').map(part => part.trim())
    .filter(part => part.startsWith(`${cookieName()}=`)).map(part => part.slice(cookieName().length + 1));
  // Reject duplicate cookies and anything other than a random 256-bit hex token.
  return values.length === 1 && /^[a-f0-9]{64}$/.test(values[0]) ? values[0] : null;
}

export function adminRequestOriginAllowed(req: Request): boolean {
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.get('origin');
  if (!origin) return true; // Non-browser clients still need the custom header / CSRF token.
  const origins = ['https://mormorskunafa.se', 'https://www.mormorskunafa.se',
    ...[process.env.FRONTEND_URL, process.env.FRONTEND_URLS, process.env.PUBLIC_WEB_APP_URL]
      .filter(Boolean).join(',').split(',').map(value => value.trim().replace(/\/$/, ''))];
  if (!secureCookie()) origins.push('http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173');
  return origins.includes(origin);
}

export function protectAdminLogin(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  if (!adminRequestOriginAllowed(req) || req.get('X-Admin-Request') !== '1') {
    res.status(403).json({ error: 'Ogiltig inloggningsbegäran.' });
    return;
  }
  next();
}

export function validAdminCsrf(req: Request): boolean {
  const token = readCookie(req);
  const provided = req.get('X-CSRF-Token') ?? '';
  return Boolean(token && adminRequestOriginAllowed(req) && /^[a-f0-9]{64}$/.test(provided)
    && timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(csrfToken(token), 'hex')));
}

export async function createAdminSession(res: Response, admin: { id: string; email: string; name: string }): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const { error } = await supabase.from('admin_sessions').insert({
    token_hash: sessionHash(token), admin_id: admin.id, email: admin.email, name: admin.name,
    expires_at: new Date(Date.now() + SESSION_MS).toISOString(),
  });
  if (error) throw new Error('Could not create administrator session');
  // Only expired authentication records are removed; accounts and business data are untouched.
  const { error: cleanupError } = await supabase.from('admin_sessions').delete().lt('expires_at', new Date().toISOString());
  if (cleanupError) console.error('[adminSessions] expired-session cleanup failed');
  res.cookie(cookieName(), token, { ...cookieOptions(), maxAge: SESSION_MS });
  return csrfToken(token);
}

export async function loadSessionByHash(hash: string): Promise<AdminSession | null> {
  const { data, error } = await supabase.from('admin_sessions')
    .select('token_hash, admin_id, email, name, expires_at').eq('token_hash', hash).maybeSingle();
  if (error) throw new Error('Could not verify administrator session');
  return data && new Date(data.expires_at).getTime() > Date.now() ? data as AdminSession : null;
}

export async function readAdminSession(req: Request): Promise<AdminSession | null> {
  const token = readCookie(req);
  return token ? loadSessionByHash(sessionHash(token)) : null;
}

export function sessionCsrfToken(req: Request): string {
  return csrfToken(readCookie(req)!);
}

export async function revokeAdminSession(req: Request, res: Response): Promise<string | null> {
  const token = readCookie(req);
  const hash = token ? sessionHash(token) : null;
  if (hash) {
    const { error } = await supabase.from('admin_sessions').delete().eq('token_hash', hash);
    if (error) throw new Error('Could not revoke administrator session');
  }
  res.clearCookie(cookieName(), cookieOptions());
  return hash;
}
