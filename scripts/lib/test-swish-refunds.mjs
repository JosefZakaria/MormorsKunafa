import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { TEST_PASSWORD, literal } from './synthetic-api.mjs';

export async function verifySwishRefundRecovery({db,call,swish,order,legacy,nativeFetch,origin}) {
  const login=await nativeFetch(origin+'/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({email:'owner@example.test',password:TEST_PASSWORD})});
  assert.equal(login.status,200); await login.text();
  const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  const headers={cookie,'x-csrf-token':decodeURIComponent(cookie.match(/mk_csrf=([^;]+)/)[1])};
  const bodyFor=async order=>({password:TEST_PASSWORD,confirmation:'ÅTERBETALA '+order.orderNumber,
    items:[{orderItemId:await db.sql(`SELECT id FROM order_items WHERE order_id=${literal(order.id)} LIMIT 1`),quantity:1}]});
  const puts=()=>swish.calls.filter(call=>call.isRefund && call.method==='PUT').length;
  const body=await bodyFor(order),key=randomUUID();
  swish.faults.refundAcceptedTimeout=true;
  const started=await call(`/api/orders/admin/${order.id}/refunds`,body,{...headers,'Idempotency-Key':key});
  assert.equal(started.status,202,JSON.stringify(started)); assert.equal(puts(),1);
  const id=started.data.refundId,providerId=id.replaceAll('-','').toUpperCase();
  assert.equal(await db.sql(`SELECT provider_refund_id FROM order_refunds WHERE id=${literal(id)}`),providerId);
  assert.equal((await call(`/api/orders/admin/${order.id}/refunds`,body,{...headers,'Idempotency-Key':key})).status,202);
  swish.faults.hideRefunds=true;
  assert.equal((await call(`/api/orders/admin/${order.id}/refunds/${id}/reconcile`,body,headers)).status,409);
  assert.equal(puts(),1); swish.faults.hideRefunds=false;
  const refund=swish.refunds.get(providerId); refund.status='PAID'; refund.amount='0.01';
  assert.equal((await call('/api/swish/refund-callback',{id:providerId,status:'PAID'})).status,500);
  assert.equal(await db.sql(`SELECT refunded_amount_ore FROM orders WHERE id=${literal(order.id)}`),'0');
  refund.amount='99.00';
  assert.equal((await call('/api/swish/refund-callback',{id:providerId,status:'PAID'})).status,200);
  assert.equal((await call('/api/swish/refund-callback',{id:providerId,status:'PAID'})).status,200);
  assert.equal(await db.sql(`SELECT refunded_amount_ore FROM orders WHERE id=${literal(order.id)}`),'9900');

  const concurrent=await Promise.all([1,2].map(()=>call(`/api/orders/admin/${order.id}/refunds`,body,{...headers,'Idempotency-Key':randomUUID()})));
  assert(concurrent.some(result=>result.status===202),JSON.stringify(concurrent)); assert.equal(puts(),2);
  const last=[...swish.refunds.values()].find(value=>value.id!==providerId); last.status='PAID';
  assert.equal((await call('/api/swish/refund-callback',{id:last.id,status:'PAID'})).status,200);
  assert.equal(await db.sql(`SELECT refunded_amount_ore FROM orders WHERE id=${literal(order.id)}`),'19800');

  const legacyBody=await bodyFor(legacy);
  const oldKey=randomUUID();
  const old=await call(`/api/orders/admin/${legacy.id}/refunds`,legacyBody,{...headers,'Idempotency-Key':oldKey});
  assert.equal(old.status,202,JSON.stringify(old));
  const oldProvider=old.data.refundId.replaceAll('-','').toUpperCase();
  await db.sql(`UPDATE order_refunds SET provider_refund_id=NULL WHERE id=${literal(old.data.refundId)}`);
  swish.faults.hideRefunds=true;
  assert.equal((await call(`/api/orders/admin/${legacy.id}/refunds`,legacyBody,{...headers,'Idempotency-Key':oldKey})).status,409);
  assert.equal(puts(),3,'A legacy ambiguous reservation must not repeat PUT');
  swish.faults.hideRefunds=false;
  swish.refunds.get(oldProvider).status='PAID';
  assert.equal((await call('/api/swish/refund-callback',{id:oldProvider,status:'PAID'})).status,200);
  assert.equal(await db.sql(`SELECT provider_refund_id FROM order_refunds WHERE id=${literal(old.data.refundId)}`),oldProvider);
  assert.equal(puts(),3,'Recovery and repeated callbacks must never PUT another refund');
  console.log('Verified Swish partial/full refunds, accepted timeout, ambiguous 404, mismatched amount, concurrent attempts and legacy callback recovery.');
}
