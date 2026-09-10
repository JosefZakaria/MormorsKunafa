import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';
import { Redis } from '@upstash/redis';

type StoredRequest = {
  payloadHash: string;
  state: 'processing' | 'complete';
  expiresAt: number;
  /** Read compatibility for entries created before sealed replay values shipped. */
  response?: unknown;
  sealedResponse?: string;
};

export const ORDER_IDEMPOTENCY_PROCESSING_TTL_SECONDS = 10 * 60;
export const ORDER_IDEMPOTENCY_COMPLETE_TTL_SECONDS = 24 * 60 * 60;
const PROCESSING_TTL_MS = ORDER_IDEMPOTENCY_PROCESSING_TTL_SECONDS * 1000;
const COMPLETE_TTL_MS = ORDER_IDEMPOTENCY_COMPLETE_TTL_SECONDS * 1000;
const SEALED_RESPONSE_VERSION = 'v1';
const SEALED_RESPONSE_KEY_CONTEXT = 'mormors-kunafa/order-idempotency-response/v1';

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

function sealedResponseKey(): Buffer {
  const secret = process.env.JWT_SECRET?.trim() ?? '';
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('[SECURITY FATAL] JWT_SECRET must be at least 32 bytes for order replay sealing');
  }
  return createHmac('sha256', secret).update(SEALED_RESPONSE_KEY_CONTEXT).digest();
}

function sealedResponseAad(context: OrderIdempotencyContext): Buffer {
  return Buffer.from(`${context.storageKey}\0${context.payloadHash}`, 'utf8');
}

function replayIntegrityError(): Error {
  return new Error('Order idempotency replay failed integrity verification');
}

/** Encrypt a replay value before it crosses the external Redis boundary. */
export function sealOrderIdempotencyResponse(
  context: OrderIdempotencyContext,
  response: unknown
): string {
  const json = JSON.stringify(response);
  if (json === undefined) throw replayIntegrityError();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sealedResponseKey(), iv);
  cipher.setAAD(sealedResponseAad(context));
  const ciphertext = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    SEALED_RESPONSE_VERSION,
    iv.toString('base64url'),
    ciphertext.toString('base64url'),
    tag.toString('base64url'),
  ].join('.');
}

/** Decode sealed values, with a bounded compatibility path for pre-change entries. */
export function decodeOrderIdempotencyResponse(
  context: OrderIdempotencyContext,
  stored: Pick<StoredRequest, 'response' | 'sealedResponse'>
): unknown {
  if (stored.sealedResponse != null) {
    try {
      const [version, encodedIv, encodedCiphertext, encodedTag, extra] =
        stored.sealedResponse.split('.');
      if (
        version !== SEALED_RESPONSE_VERSION
        || !encodedIv
        || !encodedCiphertext
        || !encodedTag
        || extra != null
        || !/^[A-Za-z0-9_-]+$/.test(encodedIv)
        || !/^[A-Za-z0-9_-]+$/.test(encodedCiphertext)
        || !/^[A-Za-z0-9_-]+$/.test(encodedTag)
      ) {
        throw replayIntegrityError();
      }
      const iv = Buffer.from(encodedIv, 'base64url');
      const ciphertext = Buffer.from(encodedCiphertext, 'base64url');
      const tag = Buffer.from(encodedTag, 'base64url');
      if (iv.length !== 12 || ciphertext.length === 0 || tag.length !== 16) {
        throw replayIntegrityError();
      }
      const decipher = createDecipheriv('aes-256-gcm', sealedResponseKey(), iv);
      decipher.setAAD(sealedResponseAad(context));
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return JSON.parse(plaintext.toString('utf8')) as unknown;
    } catch {
      throw replayIntegrityError();
    }
  }
  if (Object.prototype.hasOwnProperty.call(stored, 'response')) return stored.response;
  throw replayIntegrityError();
}

export async function beginOrderIdempotency(
  rawKey: unknown,
  payload: unknown,
  now = Date.now()
): Promise<OrderIdempotencyResult> {
  const key = parseOrderIdempotencyKey(rawKey);
  const storageKey = `mormors-kunafa:order-idempotency:${createHash('sha256').update(key).digest('base64url')}`;
  const payloadHash = hashOrderPayload(payload);
  const processing: StoredRequest = {
    payloadHash,
    state: 'processing',
    expiresAt: now + PROCESSING_TTL_MS,
  };

  let acquired = false;
  let existing: StoredRequest | null = null;
  if (hasRedis()) {
    const redis = Redis.fromEnv();
    acquired = (await redis.set(storageKey, processing, {
      nx: true,
      ex: ORDER_IDEMPOTENCY_PROCESSING_TTL_SECONDS,
    })) === 'OK';
    if (!acquired) existing = await redis.get<StoredRequest>(storageKey);
  } else {
    existing = localRequests.get(storageKey) ?? null;
    if (existing && existing.expiresAt <= now) {
      localRequests.delete(storageKey);
      existing = null;
    }
    if (!existing) {
      localRequests.set(storageKey, processing);
      acquired = true;
    }
  }

  if (acquired) return { kind: 'acquired', context: { storageKey, payloadHash } };
  if (!existing) return { kind: 'processing' };
  if (existing.payloadHash !== payloadHash) return { kind: 'conflict' };
  if (existing.state === 'complete') {
    return {
      kind: 'replay',
      response: decodeOrderIdempotencyResponse({ storageKey, payloadHash }, existing),
    };
  }
  return { kind: 'processing' };
}

export async function completeOrderIdempotency(
  context: OrderIdempotencyContext,
  response: unknown,
  now = Date.now()
): Promise<void> {
  const complete: StoredRequest = {
    payloadHash: context.payloadHash,
    state: 'complete',
    expiresAt: now + COMPLETE_TTL_MS,
    sealedResponse: sealOrderIdempotencyResponse(context, response),
  };
  if (hasRedis()) {
    const stored = await Redis.fromEnv().set(context.storageKey, complete, {
      xx: true,
      ex: ORDER_IDEMPOTENCY_COMPLETE_TTL_SECONDS,
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
