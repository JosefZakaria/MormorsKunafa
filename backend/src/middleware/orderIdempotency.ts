import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';

type StoredRequest = {
  payloadHash: string;
  state: 'processing' | 'complete';
  response?: unknown;
};

export type OrderIdempotencyContext = {
  storageKey: string;
  payloadHash: string;
};

export type OrderIdempotencyResult =
  | { kind: 'acquired'; context: OrderIdempotencyContext }
  | { kind: 'replay'; response: unknown }
  | { kind: 'processing' }
  | { kind: 'conflict' };

const localRequests = new Map<string, StoredRequest>();

export class OrderIdempotencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderIdempotencyError';
  }
}

function hasRedis(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function parseOrderIdempotencyKey(value: unknown): string {
  const key = Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) {
    throw new OrderIdempotencyError('A valid Idempotency-Key header is required');
  }
  return key;
}

export function hashOrderPayload(payload: unknown): string {
  return createHash('sha256').update(stableJson(payload)).digest('base64url');
}

export async function beginOrderIdempotency(
  rawKey: unknown,
  payload: unknown
): Promise<OrderIdempotencyResult> {
  const key = parseOrderIdempotencyKey(rawKey);
  const storageKey = `mormors-kunafa:order-idempotency:${createHash('sha256').update(key).digest('base64url')}`;
  const payloadHash = hashOrderPayload(payload);
  const processing: StoredRequest = { payloadHash, state: 'processing' };

  let acquired = false;
  let existing: StoredRequest | null = null;
  if (hasRedis()) {
    const redis = Redis.fromEnv();
    acquired = (await redis.set(storageKey, processing, { nx: true, ex: 10 * 60 })) === 'OK';
    if (!acquired) existing = await redis.get<StoredRequest>(storageKey);
  } else {
    existing = localRequests.get(storageKey) ?? null;
    if (!existing) {
      localRequests.set(storageKey, processing);
      acquired = true;
    }
  }

  if (acquired) return { kind: 'acquired', context: { storageKey, payloadHash } };
  if (!existing) return { kind: 'processing' };
  if (existing.payloadHash !== payloadHash) return { kind: 'conflict' };
  if (existing.state === 'complete') return { kind: 'replay', response: existing.response };
  return { kind: 'processing' };
}

export async function completeOrderIdempotency(
  context: OrderIdempotencyContext,
  response: unknown
): Promise<void> {
  const complete: StoredRequest = {
    payloadHash: context.payloadHash,
    state: 'complete',
    response,
  };
  if (hasRedis()) {
    const stored = await Redis.fromEnv().set(context.storageKey, complete, {
      xx: true,
      ex: 24 * 60 * 60,
    });
    if (stored !== 'OK') {
      throw new Error('The order idempotency lock expired before completion');
    }
  } else {
    localRequests.set(context.storageKey, complete);
  }
}

export async function abandonOrderIdempotency(context: OrderIdempotencyContext): Promise<void> {
  if (hasRedis()) await Redis.fromEnv().del(context.storageKey);
  else localRequests.delete(context.storageKey);
}
