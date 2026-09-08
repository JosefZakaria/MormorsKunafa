import assert from 'node:assert/strict';
import test from 'node:test';
import type Stripe from 'stripe';
import {
  validateOriginalSwishPayment,
  validateStripeRefundEvent,
  validateStripeRefundSession,
  canReplayStripeRefund,
  createStripeOrderRefund,
  RefundReconciliationRequiredError,
} from './refundProviders.js';
import { getStripe } from './stripeClient.js';

test('bounds creation retries by persisted age with a margin before provider key expiry', () => {
  const now=Date.now();
  assert.equal(canReplayStripeRefund(new Date(now-23*3600000+1).toISOString(),now),true);
  for (const value of ['', 'invalid', new Date(now+1).toISOString(), new Date(now-23*3600000).toISOString()]) {
    assert.equal(canReplayStripeRefund(value,now),false);
  }
});

test('recovers canonical refunds and rejects ambiguous or inconsistent recovery without creating', async () => {
  process.env.STRIPE_SECRET_KEY='sk_test_'+'a'.repeat(32);
  const stripe=getStripe();
  const original={retrieve:stripe.checkout.sessions.retrieve,list:stripe.refunds.list,create:stripe.refunds.create};
  const client=stripe as unknown as {
    checkout:{sessions:{retrieve:()=>Promise<Stripe.Checkout.Session>}};
    refunds:{list:(params:{starting_after?:string})=>Promise<{data:Stripe.Refund[];has_more:boolean}>;
      create:(params:unknown,options:{idempotencyKey:string})=>Promise<Stripe.Refund>};
  };
  const input={refundId:'223e4567-e89b-42d3-a456-426614174000',orderId,
    sessionId:'cs_test_expected',totalPaidOre:17900,amountOre:7900,createdAt:new Date(Date.now()-48*3600000).toISOString()};
  const refund={object:'refund',id:'re_existing',amount:7900,currency:'sek',status:'succeeded',payment_intent:'pi_expected',
    metadata:{orderId,refundId:input.refundId}} as unknown as Stripe.Refund;
  let creates=0;
  try {
    client.checkout.sessions.retrieve=async()=>stripeSession();
    client.refunds.create=async(_params,options)=> { creates++; assert.equal(options.idempotencyKey,'order-refund-'+input.refundId); return refund; };
    client.refunds.list=async()=>({data:[refund],has_more:false});
    assert.equal((await createStripeOrderRefund(input)).providerRefundId,refund.id);
    client.refunds.list=async params=>params.starting_after
      ? {data:[refund],has_more:false}
      : {data:[{...refund,id:'re_unrelated',metadata:{}} as Stripe.Refund],has_more:true};
    assert.equal((await createStripeOrderRefund(input)).providerRefundId,refund.id);
    for (const data of [[],[refund,refund],[{...refund,currency:'eur'}],[{...refund,amount:1}],
      [{...refund,payment_intent:'pi_other'}],[{...refund,metadata:{...refund.metadata,orderId:'other'}}]]) {
      client.refunds.list=async()=>({data:data as Stripe.Refund[],has_more:false});
      await assert.rejects(createStripeOrderRefund(input),RefundReconciliationRequiredError);
    }
    client.refunds.list=async()=>{throw new Error('Synthetic list unavailable');};
    await assert.rejects(createStripeOrderRefund(input));
    assert.equal(creates,0);
    client.refunds.list=async()=>({data:[],has_more:false});
    assert.equal((await createStripeOrderRefund({...input,createdAt:new Date().toISOString()})).status,'succeeded');
    assert.equal(creates,1);
  } finally {
    stripe.checkout.sessions.retrieve=original.retrieve;stripe.refunds.list=original.list;stripe.refunds.create=original.create;
  }
});

const orderId = '123e4567-e89b-42d3-a456-426614174000';

function stripeSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_test_expected',
    object: 'checkout.session',
    metadata: { orderId },
    mode: 'payment',
    status: 'complete',
    payment_status: 'paid',
    currency: 'sek',
    amount_total: 17_900,
    payment_intent: 'pi_expected',
    ...overrides,
  } as Stripe.Checkout.Session;
}

test('accepts only the exact original Stripe payment before refunding', () => {
  assert.deepEqual(validateStripeRefundSession(stripeSession(), {
    orderId,
    sessionId: 'cs_test_expected',
    totalPaidOre: 17_900,
  }), { ok: true, paymentIntentId: 'pi_expected' });
});

test('rejects mismatched Stripe refund sources', () => {
  const expected = { orderId, sessionId: 'cs_test_expected', totalPaidOre: 17_900 };
  assert.equal(validateStripeRefundSession(stripeSession({ amount_total: 1 }), expected).ok, false);
  assert.equal(validateStripeRefundSession(stripeSession({ currency: 'eur' }), expected).ok, false);
  assert.equal(validateStripeRefundSession(stripeSession({ metadata: { orderId: 'another' } }), expected).ok, false);
  assert.equal(validateStripeRefundSession(stripeSession({ payment_intent: null }), expected).ok, false);
});

test('accepts only an exact paid Swish source with a bank payment reference', () => {
  const instructionId = 'bd7204c1-3ec1-4b18-a52c-f6f8544f012f';
  const result = validateOriginalSwishPayment({
    id: instructionId,
    status: 'PAID',
    amount: '179.00',
    currency: 'SEK',
    payeeAlias: '1231181189',
    payeePaymentReference: orderId.slice(0, 35),
    paymentReference: '6D6CD7406ECE4542A80152D909EF9F6B',
  }, { instructionId, orderId, totalPaidOre: 17_900, merchantAlias: '1231181189' });
  assert.deepEqual(result, {
    ok: true,
    originalPaymentReference: '6D6CD7406ECE4542A80152D909EF9F6B',
  });
});

test('rejects Swish sources with altered amount, order or payment reference', () => {
  const instructionId = 'bd7204c1-3ec1-4b18-a52c-f6f8544f012f';
  const base = {
    id: instructionId,
    status: 'PAID',
    amount: '179.00',
    currency: 'SEK',
    payeeAlias: '1231181189',
    payeePaymentReference: orderId.slice(0, 35),
    paymentReference: '6D6CD7406ECE4542A80152D909EF9F6B',
  };
  const expected = { instructionId, orderId, totalPaidOre: 17_900, merchantAlias: '1231181189' };
  assert.equal(validateOriginalSwishPayment({ ...base, amount: '0.01' }, expected).ok, false);
  assert.equal(validateOriginalSwishPayment({ ...base, payeePaymentReference: 'another' }, expected).ok, false);
  assert.equal(validateOriginalSwishPayment({ ...base, paymentReference: 'missing' }, expected).ok, false);
});

test('accepts only a Stripe refund tied to the reserved order and payment intent', () => {
  const refund = {
    id: 're_expected',
    object: 'refund',
    amount: 7_900,
    currency: 'sek',
    metadata: { orderId, refundId: '223e4567-e89b-42d3-a456-426614174000' },
    payment_intent: 'pi_expected',
    status: 'succeeded',
  } as unknown as Stripe.Refund;
  const expected = {
    refundId: '223e4567-e89b-42d3-a456-426614174000',
    orderId,
    amountOre: 7_900,
    paymentIntentId: 'pi_expected',
    providerRefundId: 're_expected',
  };
  assert.equal(validateStripeRefundEvent(refund, expected).ok, true);
  assert.equal(validateStripeRefundEvent({ ...refund, amount: 1 }, expected).ok, false);
  assert.equal(validateStripeRefundEvent({ ...refund, payment_intent: 'pi_other' }, expected).ok, false);
  assert.equal(validateStripeRefundEvent({ ...refund, metadata: {} }, expected).ok, false);
});
