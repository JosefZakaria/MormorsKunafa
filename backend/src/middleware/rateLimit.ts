import type { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  count: number;
  resetTime: number;
}

const stores = new Map<string, Map<string, RateLimitStore>>();
const MAX_KEYS_PER_LIMITER = 10_000;

export function resolveRateLimitAddress(req: Request, isVercel = Boolean(process.env.VERCEL)): string {
  if (isVercel && req.ip) return req.ip;
  return req.socket.remoteAddress || 'unknown-ip';
}

/**
 * In-memory sliding window rate limiter middleware.
 * @param windowMs Time window in milliseconds
 * @param maxMax Maximum requests per window
 * @param message Error response message
 */
export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message?: string;
  prefix?: string;
}) {
  const { windowMs, max, message = 'Too many requests, please try again later.', prefix = 'global' } = options;

  if (!stores.has(prefix)) {
    stores.set(prefix, new Map());
  }

  const store = stores.get(prefix)!;

  // Periodically clean up expired entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of store.entries()) {
      if (now > entry.resetTime) {
        store.delete(ip);
      }
    }
  }, 5 * 60 * 1000).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    // Express req.ip is used only on Vercel, where the platform overwrites the
    // forwarded chain. Outside Vercel, never trust a caller-supplied XFF header.
    const ip = resolveRateLimitAddress(req);

    const now = Date.now();
    let entry = store.get(ip);

    if (!entry || now > entry.resetTime) {
      if (store.size >= MAX_KEYS_PER_LIMITER) {
        const oldestKey = store.keys().next().value;
        if (oldestKey) store.delete(oldestKey);
      }
      entry = { count: 1, resetTime: now + windowMs };
      store.set(ip, entry);
      next();
      return;
    }

    entry.count += 1;
    if (entry.count > max) {
      const retryAfterSeconds = Math.ceil((entry.resetTime - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({ error: message, retryAfterSeconds });
      return;
    }

    next();
  };
}
