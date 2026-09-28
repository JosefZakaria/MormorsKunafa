import assert from 'node:assert/strict';
import test from 'node:test';
import type { PublicOrderStatus } from '../shared/types/index.js';
import { orderStatusPresentation } from '../shared/utils/orderStatusPresentation.js';
import { orderRowToPublicStatus } from '../db/ordersList.js';

const order: PublicOrderStatus = {orderNumber:'#10001',status:'ny',paymentStatus:'pending',orderType:'takeaway',estimatedReadyTime:'2026-09-09T12:30:00Z'};
test('status distinguishes payment, booked pickup, delivery and completed fulfillment', () => {
  const now = new Date('2026-09-08T08:00Z').getTime();
  assert.equal(orderStatusPresentation(order,now).title,'Väntar på betalning');
  assert.equal(orderStatusPresentation(order,now).showTimer,false);
  const booked=orderStatusPresentation({...order,paymentStatus:'paid',scheduledTime:'2026-09-09T12:00Z'},now);
  assert.equal(booked.title,'Din förbeställning är bokad');
  assert.match(booked.message,/14:00/);
  assert.equal(booked.showTimer,false);
  const delivery=orderStatusPresentation({...order,paymentStatus:'paid',orderType:'delivery'},now);
  assert.match(delivery.message,/1–2 arbetsdagar/);
  assert.equal(delivery.showTimer,false);
  for (const status of ['uthämtad','levererad'] as const) assert.match(orderStatusPresentation({...order,status},now).title,new RegExp(status));
  assert.equal(orderStatusPresentation({...order,paymentStatus:'paid',status:'påbörjad'},now).showTimer,true);
});

test('public status includes fulfillment context while excluding customer and payment identifiers', () => {
  const status=orderRowToPublicStatus({order_number:'#10001',status:'ny',payment_status:'paid',order_type:'delivery',
    customer_name:'Private',customer_phone:'Private',customer_email:'Private',delivery_info_json:{address:'Private'},
    stripe_checkout_session_id:'Private',swish_instruction_id:'Private',internal_notes:'Private'});
  assert.deepEqual(Object.keys(status).sort(),['orderNumber','status','paymentStatus','orderType','scheduledTime','locationId','estimatedReadyTime','showDeliveryEstimate'].sort());
  assert.equal(JSON.stringify(status).includes('Private'),false);
});

test('city delivery exposes only the frozen timing classification', () => {
  const status=orderRowToPublicStatus({order_type:'delivery',delivery_info_json:{city:'Private',address:'Private',pricing:{showDeliveryEstimate:false}}});
  assert.equal(status.showDeliveryEstimate,false);
  assert(!JSON.stringify(status).includes('Private'));
  assert.doesNotMatch(orderStatusPresentation({...order,paymentStatus:'paid',orderType:'delivery',showDeliveryEstimate:false}).message,/1–2/);
});
