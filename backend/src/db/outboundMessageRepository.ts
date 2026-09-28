import { logSupabaseError, supabase, type Row } from './connection.js';
import { isCanonicalUuidV4 } from '../utils/resourceId.js';

export type OutboundMessageEvent = 'order_confirmation' | 'order_accepted';
export type OutboundMessageChannel = 'email' | 'sms';

export type ClaimedOutboundMessageJob = {
  id: string;
  orderId: string;
  eventKey: OutboundMessageEvent;
  channel: OutboundMessageChannel;
  templateVersion: number;
  eventAt: string;
  messageData: Record<string, unknown>;
  attemptCount: number;
  maxAttempts: number;
  claimToken: string;
};

function parseClaimedJob(raw: unknown): ClaimedOutboundMessageJob {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid outbound-message claim row');
  const row = raw as Row;
  const id = String(row.job_id ?? '');
  const orderId = String(row.order_id ?? '');
  const eventKey = row.event_key;
  const channel = row.channel;
  const templateVersion = Number(row.template_version);
  const eventAt = String(row.event_at ?? '');
  const messageData = row.message_data;
  const attemptCount = Number(row.attempt_count);
  const maxAttempts = Number(row.max_attempts);
  const claimToken = String(row.claim_token ?? '');
  if (
    !isCanonicalUuidV4(id)
    || !isCanonicalUuidV4(orderId)
    || !isCanonicalUuidV4(claimToken)
    || (eventKey !== 'order_confirmation' && eventKey !== 'order_accepted')
    || (channel !== 'email' && channel !== 'sms')
    || !Number.isSafeInteger(templateVersion)
    || templateVersion !== 1
    || !Number.isFinite(Date.parse(eventAt))
    || !messageData
    || typeof messageData !== 'object'
    || Array.isArray(messageData)
    || !Number.isSafeInteger(attemptCount)
    || !Number.isSafeInteger(maxAttempts)
    || attemptCount < 0
    || attemptCount >= maxAttempts
  ) {
    throw new Error('Invalid outbound-message claim row');
  }
  return {
    id,
    orderId,
    eventKey,
    channel,
    templateVersion,
    eventAt,
    messageData: messageData as Record<string, unknown>,
    attemptCount,
    maxAttempts,
    claimToken,
  };
}

export async function claimOutboundMessageJobs(limit = 20): Promise<ClaimedOutboundMessageJob[]> {
  const { data, error } = await supabase.rpc('claim_outbound_message_jobs', {
    p_limit: limit,
    p_lease_seconds: 120,
  });
  if (error) {
    logSupabaseError('claimOutboundMessageJobs', error);
    throw error;
  }
  if (!Array.isArray(data)) throw new Error('Invalid outbound-message claim result');
  return data.map(parseClaimedJob);
}

async function booleanRpc(name: string, args: Record<string, unknown>): Promise<void> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    logSupabaseError(name, error);
    throw error;
  }
  if (data !== true) throw new Error('Outbound-message job ownership lost');
}

export async function startOutboundMessageAttempt(job: ClaimedOutboundMessageJob): Promise<void> {
  await booleanRpc('start_outbound_message_attempt', {
    p_job_id: job.id,
    p_claim_token: job.claimToken,
  });
}

export async function completeOutboundMessageJob(
  job: ClaimedOutboundMessageJob,
  providerMessageId?: string
): Promise<void> {
  await booleanRpc('complete_outbound_message_job', {
    p_job_id: job.id,
    p_claim_token: job.claimToken,
    p_provider_message_id: providerMessageId ?? null,
  });
}

export async function retryOutboundMessageJob(
  job: ClaimedOutboundMessageJob,
  errorCode: string,
  httpStatus?: number
): Promise<'retryable' | 'permanent_failed'> {
  const { data, error } = await supabase.rpc('retry_outbound_message_job', {
    p_job_id: job.id,
    p_claim_token: job.claimToken,
    p_error_code: errorCode,
    p_http_status: httpStatus ?? null,
  });
  if (error) {
    logSupabaseError('retryOutboundMessageJob', error);
    throw error;
  }
  if (data !== 'retryable' && data !== 'permanent_failed') {
    throw new Error('Outbound-message job ownership lost');
  }
  return data;
}

export async function markOutboundMessageJobUncertain(
  job: ClaimedOutboundMessageJob,
  errorCode: string,
  httpStatus?: number
): Promise<void> {
  await booleanRpc('mark_outbound_message_job_uncertain', {
    p_job_id: job.id,
    p_claim_token: job.claimToken,
    p_error_code: errorCode,
    p_http_status: httpStatus ?? null,
  });
}

export async function failOutboundMessageJobPermanently(
  job: ClaimedOutboundMessageJob,
  errorCode: string,
  httpStatus?: number
): Promise<void> {
  await booleanRpc('fail_outbound_message_job_permanently', {
    p_job_id: job.id,
    p_claim_token: job.claimToken,
    p_error_code: errorCode,
    p_http_status: httpStatus ?? null,
  });
}
