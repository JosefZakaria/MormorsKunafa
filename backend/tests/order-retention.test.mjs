import assert from 'node:assert/strict';
import { test } from 'node:test';

const load = () => import('../dist/services/orderRetention.js');
const now = new Date('2026-11-17T12:00:00Z');
const order = (patch = {}) => ({ id: 'order-a', order_number: '#0001', status: 'ny', payment_status: 'pending',
  payment_method: 'card', total_ore: 10000, created_at: '2026-05-22T12:00:00',
  stripe_checkout_session_id: 'cs_live_stored', customer_name: 'Synthetic', customer_phone: 'synthetic',
  customer_email: 'synthetic@example.invalid', delivery_info_json: {phone: 'synthetic', address: 'Synthetic'}, ...patch });
const session = (patch = {}) => ({ id: 'cs_live_stored', orderId: 'order-a', status: 'expired', paymentStatus: 'unpaid',
  amount: 10000, currency: 'sek', mode: 'payment', liveMode: true, created: Date.parse('2026-05-22T12:01:00Z') / 1000,
  expiresAt: Date.parse('2026-10-18T12:00:00Z') / 1000, ...patch });
const evidence = (sessions = [session()], complete = true) => ({ complete, sessions });

test('30-day proposals use latest expiry, never order age, and include only present customer fields', async () => {
  const { previewOrderRetention } = await load();
  const result = previewOrderRetention(order(), [], evidence(), now);
  assert.equal(result.decisions.find(d => d.field === 'contact').status, 'candidate');
  assert.equal(result.decisions.find(d => d.field === 'contact').eligibleFrom, '2026-11-17T12:00:00.000Z');
  assert.equal(result.decisions.some(d => d.field === 'notes'), false);
  const recent = previewOrderRetention(order(), [], evidence([session({expiresAt: now.getTime() / 1000 - 60})]), now);
  assert.equal(recent.decisions.find(d => d.field === 'contact').status, 'waiting');
  const oneMillisecondEarly = previewOrderRetention(order(), [], evidence(), new Date(now.getTime() - 1));
  assert.equal(oneMillisecondEarly.decisions.find(d => d.field === 'contact').status, 'waiting');
  const latest = previewOrderRetention(order(), [], evidence([session(), session({id: 'cs_live_second', expiresAt: now.getTime() / 1000 - 60})]), now);
  assert.equal(latest.decisions.find(d => d.field === 'contact').status, 'waiting');
});

test('missing or contradictory Stripe evidence never proposes erasure', async () => {
  const { previewOrderRetention } = await load();
  const cases = [
    [order(), evidence([], true)], [order(), evidence([session()], false)],
    [order({stripe_checkout_session_id: null}), evidence()],
    [order(), evidence([session({paymentStatus: 'paid', status: 'complete'})])],
    [order(), evidence([session(), session({id: 'cs_live_old', paymentStatus: 'paid', status: 'complete'})])],
    [order(), evidence([session({orderId: 'other-order'})])],
    [order(), evidence([session({amount: 1})])], [order(), evidence([session({currency: 'eur'})])],
    [order(), evidence([session({mode: 'setup'})])], [order(), evidence([session({liveMode: false})])],
    [order(), evidence([session({status: 'open'})])], [order(), evidence([session({expiresAt: NaN})])],
    [order({created_at: 'invalid'}), evidence()],
    [order(), evidence([session({created: now.getTime() / 1000 + 1})])],
    [order({refund_status: 'pending'}), evidence()], [order({refund_status: 'failed'}), evidence()],
    [order({status: 'klar'}), evidence()], [order({payment_method: 'pay_at_pickup'}), evidence()],
    [order({scheduled_at: '2026-11-18T12:00:00'}), evidence()],
  ];
  for (const [row, stripe] of cases) {
    const result = previewOrderRetention(row, [], stripe, now);
    assert.equal(result.decisions.some(d => d.status === 'candidate'), false, JSON.stringify([row, stripe]));
  }
});

test('accounting year uses Sweden and paid data is not a 30-day candidate', async () => {
  const { previewOrderRetention } = await load();
  const result = previewOrderRetention(order({payment_status: 'paid', created_at: '2025-12-31T23:30:00'}), [], evidence(), now);
  const financial = result.decisions.find(d => d.field === 'purchase_details');
  assert.equal(financial.status, 'preserve');
  assert.equal(financial.eligibleFrom, '2034-01-01');
  assert.equal(result.decisions.some(d => d.status === 'candidate'), false);
  assert.equal(JSON.stringify(result).includes('synthetic@example.invalid'), false);
  assert.equal(JSON.stringify(result).includes('Synthetic'), false);
});

test('ready and updated timestamps never stand in for closure; mixed notes remain for review', async () => {
  const { previewOrderRetention } = await load();
  const result = previewOrderRetention(order({payment_status: 'paid', status: 'levererad', created_at: '2020-01-01T12:00:00',
    completed_at: '2020-01-01T13:00:00', updated_at: '2020-01-01T14:00:00', internal_notes: 'synthetic mixed text'}), [], evidence(), now);
  assert.equal(result.decisions.find(d => d.field === 'contact').status, 'review');
  assert.equal(result.decisions.find(d => d.field === 'notes').status, 'review');
});

test('overdue holds remain active only for selected fields and released holds no longer apply', async () => {
  const { previewOrderRetention } = await load();
  const hold = {id: 'hold-a', orderId: 'order-a', fields: ['contact'], reason: 'complaint',
    responsibleName: 'Owner', reviewOn: '2026-11-01', createdAt: '2026-10-01T12:00:00Z', releasedAt: null};
  const result = previewOrderRetention(order(), [hold, {...hold, id: 'other', orderId: 'other-order', fields: ['identity_address']}], evidence(), now);
  assert.equal(result.decisions.find(d => d.field === 'contact').status, 'hold');
  assert.equal(result.decisions.find(d => d.field === 'identity_address').status, 'candidate');
  const released = previewOrderRetention(order(), [{...hold, releasedAt: '2026-11-16T12:00:00Z'}], evidence(), now);
  assert.equal(released.decisions.find(d => d.field === 'contact').status, 'candidate');
  const overlapping = previewOrderRetention(order(), [hold, {...hold, id: 'released-hold', releasedAt: '2026-11-16T12:00:00Z'}], evidence(), now);
  assert.equal(overlapping.decisions.find(d => d.field === 'contact').status, 'hold');
});

test('Stripe preview scans all pages read-only and fails closed on incomplete scans', async () => {
  const { readRetentionCheckoutEvidence } = await import('../dist/services/retentionStripe.js');
  const calls = [];
  const raw = {id: 'cs_live_stored', metadata: {orderId: 'order-a'}, status: 'expired', payment_status: 'unpaid',
    amount_total: 10000, currency: 'sek', mode: 'payment', livemode: true, created: 1779451260, expires_at: 1792324800};
  const client = {checkout: {sessions: {list: async (params) => {
    calls.push(params);
    return calls.length === 1 ? {data: [{...raw, id: 'cs_live_old', payment_status: 'paid'}], has_more: true}
      : {data: [raw], has_more: false};
  }}}};
  const result = await readRetentionCheckoutEvidence([order()], now, client);
  assert.equal(result.complete, true);
  assert.equal(result.sessions.length, 2);
  assert.equal(calls[1].starting_after, 'cs_live_old');
  const { previewOrderRetention } = await load();
  assert.equal(previewOrderRetention(order(), [], result, now).decisions.some(d => d.status === 'candidate'), false);
  const failed = await readRetentionCheckoutEvidence([order()], now, {checkout: {sessions: {list: async () => { throw Error('synthetic Stripe failure'); }}}});
  assert.equal(failed.complete, false);
  assert.equal(previewOrderRetention(order(), [], failed, now).decisions.some(d => d.status === 'candidate'), false);
  let pages = 0;
  const limited = await readRetentionCheckoutEvidence([order()], now, {checkout: {sessions: {list: async () => ({data: [{...raw, id: `cs_live_page${++pages}`}], has_more: true})}}});
  assert.equal(limited.complete, false, 'Reaching the scan bound must never mark partial evidence complete');
  assert.equal(pages, 20);
  assert.equal(previewOrderRetention(order(), [], limited, now).decisions.some(d => d.status === 'candidate'), false);
});

test('actual erasure requires current evidence, explicit purpose checks and a fresh preview', async () => {
  const { planOrderErasure, retentionVersion } = await load();
  const row = order();
  const input = {fields: ['contact', 'delivery_contact', 'identity_address'], version: retentionVersion(row), confirmedNoAccountingNeed: true};
  const plan = planOrderErasure(row, [], evidence(), input, now);
  assert.equal(plan.rule, 'abandoned_30_days');
  assert.deepEqual(plan.fields, ['contact', 'delivery_contact', 'identity_address']);
  assert.equal(plan.lastExpiry, '2026-10-18T12:00:00.000Z');
  for (const invalid of [{...input, confirmedNoAccountingNeed: false}, {...input, version: 'stale'},
    {...input, fields: ['purchase_details']}, {...input, fields: ['payment_details']}, {...input, fields: ['contact', 'contact']}]) {
    assert.throws(() => planOrderErasure(row, [], evidence(), invalid, now));
  }
  assert.throws(() => planOrderErasure(row, [], evidence([], false), input, now));
  assert.throws(() => planOrderErasure(row, [], evidence([session({paymentStatus: 'paid'})]), input, now));
  assert.throws(() => planOrderErasure({...row, payment_status: 'paid'}, [], evidence(), input, now));
  const hold = {id: 'case', orderId: row.id, fields: ['contact'], reason: 'complaint', responsibleName: 'Owner', reviewOn: '2020-01-01', releasedAt: null};
  assert.throws(() => planOrderErasure(row, [hold], evidence(), input, now));
  assert.equal(JSON.stringify(plan).includes('synthetic@example.invalid'), false);
});

test('closed-order contact and note erasure use confirmed closure, preserve identity and respect calendar boundaries', async () => {
  const { planOrderErasure, retentionVersion } = await load();
  const row = order({status: 'klar', payment_status: 'paid', created_at: '2020-01-01T12:00:00', internal_notes: 'Synthetic work instructions'});
  const input = {fields: ['contact', 'delivery_contact'], version: retentionVersion(row), confirmedNoAccountingNeed: true, closedOn: '2023-11-17'};
  assert.equal(planOrderErasure(row, [], evidence([], false), input, now).rule, 'closed_order');
  assert.throws(() => planOrderErasure(row, [], evidence(), {...input, closedOn: '2023-11-18'}, now));
  assert.equal(planOrderErasure(row, [], evidence(), {...input, closedOn: '2026-11-16', purposeEnded: true}, now).rule, 'purpose_ended');
  assert.throws(() => planOrderErasure(row, [], evidence(), {...input, closedOn: '2019-01-01'}, now));
  assert.throws(() => planOrderErasure(row, [], evidence(), {...input, closedOn: '2026-02-30'}, now));
  assert.throws(() => planOrderErasure(row, [], evidence(), {...input, fields: ['identity_address']}, now));
  assert.throws(() => planOrderErasure(row, [], evidence(), {...input, fields: ['identity_address'], purposeEnded: true}, now));
  const notes = {...input, fields: ['notes'], closedOn: '2026-08-19', notesOperationalOnly: true};
  assert.equal(planOrderErasure(row, [], evidence(), notes, now).rule, 'closed_order');
  assert.throws(() => planOrderErasure(row, [], evidence(), {...notes, closedOn: '2026-08-20'}, now));
  assert.throws(() => planOrderErasure(row, [], evidence(), {...notes, notesOperationalOnly: false}, now));
  assert.throws(() => planOrderErasure({...row, refund_status: 'pending'}, [], evidence(), {...input, version: retentionVersion({...row, refund_status: 'pending'})}, now));
});

test('checkout cannot restart a draft once the erasure eligibility window can be reached', async () => {
  const {checkoutAttemptExpired} = await load();
  assert.equal(checkoutAttemptExpired(order({created_at: '2026-10-18T12:00:00'}), now), true);
  assert.equal(checkoutAttemptExpired(order({created_at: '2026-10-18T12:00:00.001'}), now), false);
  assert.equal(checkoutAttemptExpired(order({created_at: 'invalid'}), now), true);
});
