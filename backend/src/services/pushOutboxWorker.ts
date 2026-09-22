import { waitUntil } from '@vercel/functions';
import { fetchOrderRow } from '../db/orderRepository.js';
import {
  claimPushOutboxJobs,
  reconcilePushOutbox,
  settlePushOutboxJob,
  type PushOutboxJob,
} from '../db/pushOutboxRepository.js';
import { sendOrderCreatedPush } from './pushNotifications.js';
import type { OrderCreatedEvent } from './realtimeEvents.js';

const MAX_JOB_AGE_MS = 15 * 60 * 1000;
const RETRY_DELAYS_SECONDS = [60, 120, 240, 480];
const MAX_CONCURRENT_JOBS = 5;

function retryDelay(attempts: number): number {
  return RETRY_DELAYS_SECONDS[Math.min(Math.max(attempts - 1, 0), RETRY_DELAYS_SECONDS.length - 1)];
}

function eventFromOrder(job: PushOutboxJob, order: Record<string, unknown>): OrderCreatedEvent {
  const rawType = String(order.order_type ?? 'takeaway');
  const orderType = rawType === 'delivery' || rawType === 'eat-here' ? rawType : 'takeaway';
  return {
    event_id: job.event_id,
    event_type: 'ORDER_CREATED',
    order_id: job.order_id,
    order_number: String(order.order_number ?? ''),
    created_at: job.created_at,
    order_type: orderType,
    location_id: order.location_id != null ? String(order.location_id) : null,
  };
}

async function processJob(job: PushOutboxJob): Promise<'done' | 'pending' | 'dead'> {
  const ageMs = Date.now() - new Date(job.created_at).getTime();
  if (ageMs >= MAX_JOB_AGE_MS) {
    const settled = await settlePushOutboxJob(job, 'dead', job.last_error ?? 'Push was not delivered within 15 minutes');
    return settled ? 'dead' : 'pending';
  }

  try {
    const order = await fetchOrderRow(job.order_id);
    if (!order || String(order.payment_status ?? '') !== 'paid') {
      const settled = await settlePushOutboxJob(job, 'dead', 'Paid order is no longer available');
      return settled ? 'dead' : 'pending';
    }

    const result = await sendOrderCreatedPush(eventFromOrder(job, order));
    if (result.permanentErrors.length > 0) {
      const settled = await settlePushOutboxJob(job, 'dead', result.permanentErrors.join('; '));
      return settled ? 'dead' : 'pending';
    }
    if (result.successfulCount > 0 && result.retryableErrors.length === 0) {
      const settled = await settlePushOutboxJob(job, 'done', null);
      return settled ? 'done' : 'pending';
    }

    const reason = result.retryableErrors.join('; ') || 'No active subscription can receive this order';
    await settlePushOutboxJob(job, 'pending', reason, retryDelay(job.attempts));
    return 'pending';
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error('[push] Outbox job failed', { eventId: job.event_id, orderId: job.order_id, error });
    await settlePushOutboxJob(job, 'pending', reason, retryDelay(job.attempts));
    return 'pending';
  }
}

export async function drainPushOutbox(): Promise<{ reconciled: number; claimed: number; done: number; pending: number; dead: number }> {
  const reconciled = await reconcilePushOutbox();
  const jobs = await claimPushOutboxJobs();
  const counts = { reconciled, claimed: jobs.length, done: 0, pending: 0, dead: 0 };
  for (let offset = 0; offset < jobs.length; offset += MAX_CONCURRENT_JOBS) {
    const outcomes = await Promise.all(jobs.slice(offset, offset + MAX_CONCURRENT_JOBS).map(processJob));
    for (const outcome of outcomes) counts[outcome] += 1;
  }
  return counts;
}

export function scheduleImmediatePush(): void {
  // Keep the payment function separate from the worker's 60-second runtime.
  // Cron remains the durable recovery path if this invocation never runs.
  if (process.env.VERCEL !== '1') return;
  const host = process.env.VERCEL_URL?.trim();
  const secret = process.env.PUSH_WORKER_SECRET?.trim();
  if (!host || !secret || secret.length < 32) {
    console.error('[push] Immediate drain unavailable; worker URL or secret missing');
    return;
  }
  try {
    waitUntil(fetch(`https://${host}/api/internal/push/drain`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(55_000),
    }).then((response) => {
      if (!response.ok) throw new Error(`Worker returned HTTP ${response.status}`);
    }).catch((error) => {
      console.error('[push] Immediate outbox drain failed; cron will retry', error);
    }));
  } catch (error) {
    console.error('[push] Could not schedule immediate drain; cron will retry', error);
  }
}
