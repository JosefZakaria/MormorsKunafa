import assert from 'node:assert/strict';
import test from 'node:test';
import type { Row } from '../db/connection.js';
import type { ClaimedOutboundMessageJob } from '../db/outboundMessageRepository.js';
import { OutboundDeliveryError } from './outboundDeliveryError.js';
import {
  buildOutboundSmsMessage,
  processClaimedOutboundMessageJob,
  type OutboundWorkerDependencies,
} from './outboundMessageWorker.js';

const job = (patch: Partial<ClaimedOutboundMessageJob> = {}): ClaimedOutboundMessageJob => ({
  id: '00000000-0000-4000-8000-000000000001',
  orderId: '00000000-0000-4000-8000-000000000002',
  eventKey: 'order_confirmation',
  channel: 'email',
  templateVersion: 1,
  eventAt: '2026-09-12T12:00:00.000Z',
  messageData: {},
  attemptCount: 0,
  maxAttempts: 5,
  claimToken: '00000000-0000-4000-8000-000000000003',
  ...patch,
});

const order: Row = {
  customer_name: 'Ada',
  customer_email: 'ada@example.test',
  customer_phone: '+46700000000',
  order_type: 'takeaway',
  scheduled_at: '2026-09-13T12:00:00.000Z',
  estimated_ready_at: '2026-09-13T12:30:00.000Z',
};

function dependencies(patch: Partial<OutboundWorkerDependencies> = {}): OutboundWorkerDependencies {
  return {
    loadOrder: async () => ({ order, items: [] }),
    pickupSuffix: async () => ' Plats: Höja.',
    startAttempt: async () => {},
    complete: async () => {},
    retry: async () => 'retryable',
    uncertain: async () => {},
    permanent: async () => {},
    email: async () => ({ providerMessageId: 'email_1' }),
    sms: async () => ({ providerMessageId: 'sms_1' }),
    ...patch,
  };
}

test('uses one stable Resend idempotency key and persists provider success', async () => {
  let key = '';
  let completed = '';
  const outbound = job();
  const outcome = await processClaimedOutboundMessageJob(outbound, dependencies({
    email: async (ctx) => {
      key = ctx.idempotencyKey;
      assert.equal(ctx.paidAt, outbound.eventAt);
      return { providerMessageId: 'email_provider_1' };
    },
    complete: async (_claimed, providerMessageId) => { completed = providerMessageId ?? ''; },
  }));
  assert.equal(outcome, 'succeeded');
  assert.equal(key, `mk-order-message-${outbound.id}`);
  assert.equal(completed, 'email_provider_1');
});

test('never turns an uncertain Sinch response into an automatic retry', async () => {
  let retries = 0;
  let uncertain = 0;
  const outcome = await processClaimedOutboundMessageJob(
    job({ channel: 'sms' }),
    dependencies({
      sms: async () => { throw new OutboundDeliveryError('uncertain', 'provider_response_uncertain'); },
      retry: async () => { retries += 1; return 'retryable'; },
      uncertain: async () => { uncertain += 1; },
    })
  );
  assert.equal(outcome, 'uncertain');
  assert.equal(uncertain, 1);
  assert.equal(retries, 0);
});

test('does not retry SMS after provider success when persisting completion fails', async () => {
  let retries = 0;
  let providerCalls = 0;
  const outcome = await processClaimedOutboundMessageJob(
    job({ channel: 'sms' }),
    dependencies({
      sms: async () => {
        providerCalls += 1;
        return { providerMessageId: 'sms_provider_accepted' };
      },
      complete: async () => { throw new Error('database response lost'); },
      retry: async () => { retries += 1; return 'retryable'; },
    })
  );
  assert.equal(outcome, 'deferred');
  assert.equal(providerCalls, 1);
  assert.equal(retries, 0);
});

test('deterministically malformed acceptance jobs become permanent before provider start', async () => {
  let started = 0;
  let failureCode = '';
  const outcome = await processClaimedOutboundMessageJob(
    job({ channel: 'sms', eventKey: 'order_accepted', messageData: {} }),
    dependencies({
      loadOrder: async () => ({
        order: { ...order, estimated_ready_at: null },
        items: [],
      }),
      startAttempt: async () => { started += 1; },
      permanent: async (_claimed, code) => { failureCode = code; },
    })
  );
  assert.equal(outcome, 'permanent_failed');
  assert.equal(started, 0);
  assert.equal(failureCode, 'invalid_job');
});

test('preserves the existing confirmation and acceptance SMS wording', async () => {
  const confirmation = await buildOutboundSmsMessage(
    job({ channel: 'sms' }), order, async () => ' Plats: Höja.'
  );
  assert.match(confirmation, /^Tack för din beställning från Mormors Kunafa, Ada!/);
  assert.match(confirmation, /Plats: Höja\./);
  assert.match(confirmation, /Planerad upphämtning:/);

  const accepted = await buildOutboundSmsMessage(
    job({
      channel: 'sms',
      eventKey: 'order_accepted',
      messageData: { estimated_ready_at: '2026-09-13T12:45:00.000Z' },
    }),
    order,
    async () => ' Plats: Höja.'
  );
  assert.match(accepted, /^Hej, Ada! Din order är mottagen/);
  assert.match(accepted, /kl 14:45/);
});

test('missing orders become permanent without starting a provider attempt', async () => {
  let started = 0;
  let failureCode = '';
  const outcome = await processClaimedOutboundMessageJob(job(), dependencies({
    loadOrder: async () => null,
    startAttempt: async () => { started += 1; },
    permanent: async (_claimed, code) => { failureCode = code; },
  }));
  assert.equal(outcome, 'permanent_failed');
  assert.equal(started, 0);
  assert.equal(failureCode, 'order_not_found');
});
