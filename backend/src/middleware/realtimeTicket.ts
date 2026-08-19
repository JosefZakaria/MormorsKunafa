import { createHash, randomBytes } from 'node:crypto';
import { Redis } from '@upstash/redis';

const TICKET_TTL_SECONDS = 60;
const TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type RealtimeTicketPayload = {
  adminId: string;
  tokenVersion: number;
  expiresAt: number;
};

const localTickets = new Map<string, RealtimeTicketPayload>();

function hasRedis(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

function storageKey(ticket: string): string {
  const digest = createHash('sha256').update(ticket).digest('base64url');
  return `mormors-kunafa:realtime-ticket:${digest}`;
}

export async function issueRealtimeTicket(
  adminId: string,
  tokenVersion: number,
  now = Date.now()
): Promise<{ ticket: string; expiresInSeconds: number }> {
  if (!adminId || !Number.isSafeInteger(tokenVersion) || tokenVersion < 1) {
    throw new Error('Cannot issue a realtime ticket for an invalid admin session');
  }

  const ticket = randomBytes(32).toString('base64url');
  const payload: RealtimeTicketPayload = {
    adminId,
    tokenVersion,
    expiresAt: now + TICKET_TTL_SECONDS * 1000,
  };

  if (hasRedis()) {
    const stored = await Redis.fromEnv().set(storageKey(ticket), payload, {
      nx: true,
      ex: TICKET_TTL_SECONDS,
    });
    if (stored !== 'OK') throw new Error('Could not reserve a unique realtime ticket');
  } else {
    localTickets.set(storageKey(ticket), payload);
  }

  return { ticket, expiresInSeconds: TICKET_TTL_SECONDS };
}

export async function consumeRealtimeTicket(
  rawTicket: unknown,
  now = Date.now()
): Promise<RealtimeTicketPayload | null> {
  const ticket = typeof rawTicket === 'string' ? rawTicket : '';
  if (!TICKET_PATTERN.test(ticket)) return null;

  const key = storageKey(ticket);
  let payload: RealtimeTicketPayload | null;
  if (hasRedis()) {
    payload = await Redis.fromEnv().getdel<RealtimeTicketPayload>(key);
  } else {
    payload = localTickets.get(key) ?? null;
    localTickets.delete(key);
  }

  if (
    !payload ||
    !payload.adminId ||
    !Number.isSafeInteger(payload.tokenVersion) ||
    payload.tokenVersion < 1 ||
    !Number.isFinite(payload.expiresAt) ||
    payload.expiresAt <= now
  ) {
    return null;
  }
  return payload;
}
