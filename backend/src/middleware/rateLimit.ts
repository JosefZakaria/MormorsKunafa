import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type { Request, Response, NextFunction } from 'express';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

interface LocalEntry {
  count: number;
  resetTime: number;
}

const localStores = new Map<string, Map<string, LocalEntry>>();

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL_ENV);
}

function hasDistributedConfig(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

export function assertRateLimitConfiguration(): void {
  if (isProduction() && !hasDistributedConfig()) {
    throw new Error(
      '[SECURITY FATAL] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production'
    );
  }
}

export function getTrustedClientIp(req: Request): string {
  if (process.env.VERCEL_ENV) {
    const forwarded = req.headers['x-vercel-forwarded-for'];
    const candidate = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.trim() ?? '';
    if (isIP(candidate)) return candidate;
  }
  const socketAddress = req.socket.remoteAddress?.trim() ?? '';
  return isIP(socketAddress) ? socketAddress : 'unknown-client';
}

export function hashRateLimitIdentifier(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('base64url');
}

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message?: string;
  prefix?: string;
  keyGenerator?: (req: Request) => string;
}) {
  const {
    windowMs,
    max,
    message = 'Too many requests, please try again later.',
    prefix = 'global',
    keyGenerator = getTrustedClientIp,
  } = options;

  const localStore = new Map<string, LocalEntry>();
  localStores.set(prefix, localStore);
  const distributed = hasDistributedConfig()
    ? new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(max, `${windowMs} ms`),
        prefix: `mormors-kunafa:ratelimit:${prefix}`,
        analytics: false,
      })
    : null;

  const reject = (res: Response, resetTime: number): void => {
    const retryAfterSeconds = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
    res.setHeader('Retry-After', String(retryAfterSeconds));
    res.status(429).json({ error: message, retryAfterSeconds });
  };

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const identifier = keyGenerator(req) || 'unknown-client';

    if (distributed) {
      try {
        const result = await distributed.limit(identifier);
        res.setHeader('X-RateLimit-Limit', String(result.limit));
        res.setHeader('X-RateLimit-Remaining', String(result.remaining));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.reset / 1000)));
        if (!result.success) {
          reject(res, result.reset);
          return;
        }
        next();
        return;
      } catch (error) {
        console.error('[rate-limit] distributed limiter failed', { prefix, error });
        res.status(503).json({ error: 'Request protection is temporarily unavailable' });
        return;
      }
    }

    if (isProduction()) {
      res.status(503).json({ error: 'Request protection is not configured' });
      return;
    }

    const now = Date.now();
    const entry = localStore.get(identifier);
    if (!entry || now >= entry.resetTime) {
      localStore.set(identifier, { count: 1, resetTime: now + windowMs });
      next();
      return;
    }
    entry.count += 1;
    if (entry.count > max) {
      reject(res, entry.resetTime);
      return;
    }
    next();
  };
}
