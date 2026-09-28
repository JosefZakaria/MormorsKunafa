import type { Row } from '../db/connection.js';
import { getOrderById } from '../db/orderRepository.js';
import {
  claimOutboundMessageJobs,
  completeOutboundMessageJob,
  failOutboundMessageJobPermanently,
  markOutboundMessageJobUncertain,
  retryOutboundMessageJob,
  startOutboundMessageAttempt,
  type ClaimedOutboundMessageJob,
} from '../db/outboundMessageRepository.js';
import { inStorePickupSmsSuffix } from '../db/locations.js';
import { formatStockholmDateTime } from '../utils/stockholmWallTime.js';
import { sendOrderConfirmationEmail } from './OrderConfirmationEmail.js';
import { sendSms } from './SmsService.js';
import { asOutboundDeliveryError, OutboundDeliveryError } from './outboundDeliveryError.js';

type OrderRows = { order: Row; items: Row[] };
type DeliveryResult = { providerMessageId?: string };

export type OutboundWorkerDependencies = {
  loadOrder: (orderId: string) => Promise<OrderRows | null>;
  pickupSuffix: (order: Row) => Promise<string>;
  startAttempt: (job: ClaimedOutboundMessageJob) => Promise<void>;
  complete: (job: ClaimedOutboundMessageJob, providerMessageId?: string) => Promise<void>;
  retry: (
    job: ClaimedOutboundMessageJob,
    errorCode: string,
    httpStatus?: number
  ) => Promise<'retryable' | 'permanent_failed'>;
  uncertain: (
    job: ClaimedOutboundMessageJob,
    errorCode: string,
    httpStatus?: number
  ) => Promise<void>;
  permanent: (
    job: ClaimedOutboundMessageJob,
    errorCode: string,
    httpStatus?: number
  ) => Promise<void>;
  email: (
    ctx: OrderRows & { paidAt?: string; idempotencyKey: string }
  ) => Promise<{ providerMessageId: string }>;
  sms: (to: string, message: string) => Promise<DeliveryResult>;
};

const defaultDependencies: OutboundWorkerDependencies = {
  loadOrder: getOrderById,
  pickupSuffix: inStorePickupSmsSuffix,
  startAttempt: startOutboundMessageAttempt,
  complete: completeOutboundMessageJob,
  retry: retryOutboundMessageJob,
  uncertain: markOutboundMessageJobUncertain,
  permanent: failOutboundMessageJobPermanently,
  email: sendOrderConfirmationEmail,
  sms: sendSms,
};

export type OutboundWorkerOutcome =
  | 'succeeded'
  | 'retryable'
  | 'uncertain'
  | 'permanent_failed'
  | 'deferred';

function readyTimeForAcceptedMessage(job: ClaimedOutboundMessageJob, order: Row): Date | null {
  const raw = job.messageData.estimated_ready_at ?? order.estimated_ready_at;
  const ready = raw == null ? null : new Date(String(raw));
  return ready && !Number.isNaN(ready.getTime()) ? ready : null;
}

export async function buildOutboundSmsMessage(
  job: ClaimedOutboundMessageJob,
  order: Row,
  pickupSuffix: (order: Row) => Promise<string>
): Promise<string> {
  const customerName = String(order.customer_name ?? '').trim();
  const placeSuffix = await pickupSuffix(order);
  if (job.eventKey === 'order_confirmation') {
    const scheduled = order.scheduled_at
      ? ` Planerad upphämtning: ${formatStockholmDateTime(order.scheduled_at as string)}.`
      : '';
    return `Tack för din beställning från Mormors Kunafa${customerName ? `, ${customerName}` : ''}! Vi tar snart emot din beställning.${placeSuffix}${scheduled}`;
  }
  if (job.eventKey === 'order_accepted') {
    const ready = readyTimeForAcceptedMessage(job, order);
    if (!ready) throw new OutboundDeliveryError('permanent', 'invalid_job');
    const readyTime = ready.toLocaleTimeString('sv-SE', {
      timeZone: 'Europe/Stockholm',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `Hej${customerName ? `, ${customerName}` : ''}! Din order är mottagen och beräknas vara klar kl ${readyTime}.${placeSuffix}`;
  }
  throw new OutboundDeliveryError('permanent', 'invalid_job');
}

export async function processClaimedOutboundMessageJob(
  job: ClaimedOutboundMessageJob,
  dependencies: OutboundWorkerDependencies = defaultDependencies
): Promise<OutboundWorkerOutcome> {
  let orderRows: OrderRows | null;
  try {
    orderRows = await dependencies.loadOrder(job.orderId);
  } catch {
    // No provider request was started. The lease-recovery RPC safely requeues it.
    return 'deferred';
  }
  if (!orderRows) {
    await dependencies.permanent(job, 'order_not_found');
    return 'permanent_failed';
  }

  const phone = String(orderRows.order.customer_phone ?? '').trim();
  let smsMessage: string | undefined;
  if (job.channel === 'sms') {
    if (String(orderRows.order.order_type ?? '') === 'delivery' || !phone) {
      await dependencies.permanent(job, 'invalid_recipient');
      return 'permanent_failed';
    }
    try {
      smsMessage = await buildOutboundSmsMessage(job, orderRows.order, dependencies.pickupSuffix);
    } catch (error) {
      if (error instanceof OutboundDeliveryError && error.disposition === 'permanent') {
        await dependencies.permanent(job, error.code, error.httpStatus);
        return 'permanent_failed';
      }
      // Resolving pickup metadata can fail before any provider request starts.
      return 'deferred';
    }
  } else if (job.eventKey !== 'order_confirmation') {
    await dependencies.permanent(job, 'invalid_job');
    return 'permanent_failed';
  }

  try {
    await dependencies.startAttempt(job);
  } catch {
    // No provider request was started. Lease recovery can safely requeue this
    // claim without consuming another delivery attempt.
    return 'deferred';
  }

  let result: DeliveryResult;
  try {
    result = job.channel === 'email'
      ? await dependencies.email({
          ...orderRows,
          paidAt: job.eventAt,
          idempotencyKey: `mk-order-message-${job.id}`,
        })
      : await dependencies.sms(phone, smsMessage!);
  } catch (error) {
    const failure = job.channel === 'sms' && !(error instanceof OutboundDeliveryError)
      ? new OutboundDeliveryError('uncertain', 'provider_response_uncertain')
      : asOutboundDeliveryError(error);
    if (failure.disposition === 'uncertain') {
      await dependencies.uncertain(job, failure.code, failure.httpStatus);
      return 'uncertain';
    }
    if (failure.disposition === 'permanent') {
      await dependencies.permanent(job, failure.code, failure.httpStatus);
      return 'permanent_failed';
    }
    return dependencies.retry(job, failure.code, failure.httpStatus);
  }

  try {
    await dependencies.complete(job, result.providerMessageId);
  } catch {
    // The provider accepted the request, but persisting success was not
    // confirmed. Leave the lease in processing; recovery marks it uncertain
    // instead of risking a duplicate provider request.
    return 'deferred';
  }
  return 'succeeded';
}

export async function processOutboundMessageJobs(limit = 20): Promise<{
  claimed: number;
  outcomes: Record<OutboundWorkerOutcome, number>;
}> {
  const jobs = await claimOutboundMessageJobs(limit);
  const outcomes: Record<OutboundWorkerOutcome, number> = {
    succeeded: 0,
    retryable: 0,
    uncertain: 0,
    permanent_failed: 0,
    deferred: 0,
  };
  const results = await Promise.all(jobs.map((job) => processClaimedOutboundMessageJob(job)));
  for (const outcome of results) outcomes[outcome] += 1;
  return { claimed: jobs.length, outcomes };
}
