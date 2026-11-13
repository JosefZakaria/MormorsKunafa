import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import type { Request, RequestHandler } from 'express';
import { supabase } from '../db/connection.js';

export type RateLimitRule = { scope: string; identifier: string; limit: number; windowSeconds: number };

export async function consumeRateLimits(rules: RateLimitRule[]): Promise<number> {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || secret.length < 32 || secret === 'dev-secret-change-in-production') {
    throw new Error('Rate-limit hashing secret is not configured');
  }
  const { data, error } = await supabase.rpc('consume_api_rate_limits', {
    p_rules: rules.map(({ scope, identifier, limit, windowSeconds }) => ({
      key: `${scope}:${createHmac('sha256', secret).update(JSON.stringify([scope, identifier])).digest('hex')}`,
      limit, windowSeconds,
    })),
  });
  if (error || !Number.isSafeInteger(data) || data < 0 || data > 86400) {
    throw new Error('Rate-limit store is unavailable');
  }
  return data as number;
}

export function clientAddress(req: Request): string {
  // Vercel overwrites this header; elsewhere, ignore user-supplied proxy headers.
  let address = process.env.VERCEL === '1' ? req.get('x-forwarded-for')?.split(',')[0]?.trim() : req.socket.remoteAddress;
  if (!address || !isIP(address)) throw new Error('Client address is unavailable');
  address = address.replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, '$1');
  return isIP(address) === 6 ? new URL(`http://[${address}]`).hostname.slice(1, -1) : address;
}

export function normalizedPhone(value: string): string {
  let digits = value.replace(/\D/g, '').replace(/^00/, '');
  if (digits.startsWith('0')) digits = `46${digits.slice(1)}`;
  return digits;
}

function requestLimit(rules: (req: Request) => RateLimitRule[]): RequestHandler {
  return (req, res, next) => {
    void (async () => {
      try {
        const retryAfter = await consumeRateLimits(rules(req));
        if (retryAfter) {
          res.set('Retry-After', String(retryAfter));
          res.set('Cache-Control', 'no-store');
          res.status(429).json({ error: 'För många försök. Vänta en stund och försök igen.', retryAfter });
          return;
        }
        next();
      } catch {
        console.error('[rate limit] protection unavailable');
        res.set('Cache-Control', 'no-store');
        res.status(503).json({ error: 'Tjänsten är tillfälligt otillgänglig. Försök igen om en stund.' });
      }
    })();
  };
}

export const limitLoginAttempts = requestLimit(req => {
  const rules = [{ scope: 'login-ip', identifier: clientAddress(req), limit: 60, windowSeconds: 900 }];
  const email = req.body?.email;
  if (typeof email === 'string' && email.trim()) {
    rules.push({ scope: 'login-account', identifier: email.trim().toLowerCase(), limit: 20, windowSeconds: 900 });
  }
  return rules;
});

export const limitOrderCreation = requestLimit(req => {
  const rules = [{ scope: 'order-ip', identifier: clientAddress(req), limit: 30, windowSeconds: 600 }];
  const email = req.body?.customerInfo?.email ?? req.body?.deliveryInfo?.email;
  const phone = req.body?.customerInfo?.phone ?? req.body?.deliveryInfo?.phone;
  if (typeof email === 'string' && email.trim()) {
    rules.push({ scope: 'order-email', identifier: email.trim().toLowerCase(), limit: 10, windowSeconds: 600 });
  }
  if (typeof phone === 'string' && normalizedPhone(phone)) {
    rules.push({ scope: 'order-phone', identifier: normalizedPhone(phone), limit: 10, windowSeconds: 600 });
  }
  return rules;
});

export async function allowNotification(channel: 'sms' | 'email', recipient: string): Promise<boolean> {
  const retryAfter = await consumeRateLimits([
    { scope: `${channel}-recipient`, identifier: channel === 'sms' ? normalizedPhone(recipient) : recipient.trim().toLowerCase(), limit: 20, windowSeconds: 3600 },
    { scope: `${channel}-global`, identifier: 'all', limit: 1000, windowSeconds: 3600 },
  ]);
  if (retryAfter) console.warn('[notifications] rate limit reached', { channel, retryAfter });
  return retryAfter === 0;
}
