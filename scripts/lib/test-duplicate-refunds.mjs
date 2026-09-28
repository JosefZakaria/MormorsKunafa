import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { literal, TEST_PASSWORD } from './synthetic-api.mjs';

export async function testDuplicateRefundRecovery({ db, call, stripe, sessions, refunds, faults, expireRefundKeys, orderId, ownerHeaders, staffHeaders }) {
  const original = [...sessions.values()].find(session => session.metadata.orderId === orderId);
  const duplicate = { ...original, object: 'checkout.session', id: 'cs_test_duplicate_' + randomUUID().replaceAll('-', ''),
    payment_intent: 'pi_test_duplicate_' + randomUUID().replaceAll('-', ''), status: 'complete', payment_status: 'paid' };
  sessions.set(duplicate.id, duplicate);
  const event = { id: 'evt_test_duplicate_' + randomUUID().replaceAll('-', ''), type: 'checkout.session.completed', livemode: false, data: { object: duplicate } };
  const previousRetrieve = stripe.events.retrieve;
  stripe.events.retrieve = async id => { assert.equal(id, event.id); return event; };
  await db.sql(`INSERT INTO payment_provider_events(provider,event_id,event_type,livemode,status,outcome,order_id,processed_at)
    VALUES ('stripe',${literal(event.id)},'checkout.session.completed',false,'processed','alert_paid_session_validation_failed',${literal(orderId)},now())`);
  const route = `/api/admin/payment-alerts/${event.id}`;
  const baseline = { creates: faults.refundCreateCalls, refunds: refunds.size };
  const originalRefunded = await db.sql(`SELECT refunded_amount_ore FROM orders WHERE id=${literal(orderId)}`);
  try {
    const detail = await call(route, undefined, ownerHeaders);
    assert.equal(detail.data.status, 'eligible', JSON.stringify(detail.data));
    const body = { password: TEST_PASSWORD, confirmation: detail.data.confirmation };
    const headers = { ...ownerHeaders, 'Idempotency-Key': randomUUID() };
    assert.equal((await call(route + '/refund', body, { ...staffHeaders, 'Idempotency-Key': randomUUID() })).status, 403);
    assert.equal((await call(route + '/refund', { ...body, password: 'wrong' }, headers)).status, 401);
    assert.equal((await call(route + '/refund', body, { cookie: ownerHeaders.cookie })).status, 403);
    faults.refundTimeout = true;
    const acceptedLost = await call(route + '/refund', body, headers);
    assert.equal(acceptedLost.status, 202, JSON.stringify(acceptedLost.data));
    assert.equal(acceptedLost.data.confirmation, detail.data.confirmation);
    assert.equal(refunds.size, baseline.refunds + 1);
    await db.sql(`UPDATE duplicate_stripe_refunds SET created_at=now()-interval '2 days' WHERE stripe_event_id=${literal(event.id)}`);
    expireRefundKeys();
    const pending = await call(route, undefined, ownerHeaders);
    assert.equal(pending.data.status, 'pending');
    assert.equal(pending.data.confirmation, detail.data.confirmation);
    faults.hideRefunds = true;
    const unresolved = await call(route + '/refund', body, headers);
    assert.equal(unresolved.status, 409);
    assert.equal(unresolved.data.code, 'REFUND_RECONCILIATION_REQUIRED');
    assert.equal(faults.refundCreateCalls, baseline.creates + 1);
    faults.hideRefunds = false;
    const recovered = await call(route + '/refund', body, { ...headers, 'Idempotency-Key': randomUUID() });
    assert.equal(recovered.status, 200, JSON.stringify(recovered.data));
    assert.equal(recovered.data.status, 'succeeded');
    assert.equal((await call(route + '/refund', body, headers)).data.status, 'succeeded');
    assert.equal(faults.refundCreateCalls, baseline.creates + 1, 'Recovery must not create another transfer');
    assert.equal(await db.sql(`SELECT count(*) FROM duplicate_stripe_refunds WHERE stripe_event_id=${literal(event.id)} AND status='succeeded'`), '1');
    assert.equal(await db.sql(`SELECT refunded_amount_ore FROM orders WHERE id=${literal(orderId)}`), originalRefunded, 'Duplicate-payment ledger must not change ordinary item refunds');
    assert.equal((await call('/api/admin/payment-alerts', undefined, ownerHeaders)).data.some(alert => alert.eventId === event.id), false);
  } finally {
    stripe.events.retrieve = previousRetrieve;
    faults.hideRefunds = false;
  }
}
