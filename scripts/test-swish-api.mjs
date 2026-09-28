import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withTestDatabase } from './lib/local-test-database.mjs';
import { initializeSyntheticDatabase, createSyntheticApp, HOJA, PRODUCT, literal } from './lib/synthetic-api.mjs';
import { verifySwishRefundRecovery } from './lib/test-swish-refunds.mjs';

const nativeFetch = globalThis.fetch;
const checkoutContractHeader = {'X-Checkout-Contract':'order-v2'};
await withTestDatabase(async db => {
  await initializeSyntheticDatabase(db);
  const { app, swishMock: swish } = await createSyntheticApp(db, { swish:true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const call = async (route, body, headers={}) => {
    const response = await nativeFetch(origin+route,{method:body===undefined?'GET':'POST',
      headers:{'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const text = await response.text();
    return {status:response.status,data:response.headers.get('content-type')?.includes('application/json') && text ? JSON.parse(text) : text};
  };
  let number=0;
  const create = async () => {
    const result = await call('/api/orders',{items:[{productId:PRODUCT,variantId:'250 gram',quantity:2}],orderType:'takeaway',
      locationId:HOJA,paymentMethod:'swish',scheduledTime:new Date(Date.now()+86400000).toISOString().slice(0,10)+'T14:00',
      customerInfo:{name:'Synthetic Swish Buyer',phone:'07000000'+String(++number).padStart(2,'0'),email:'swish@example.test'}},
      {...checkoutContractHeader,'Idempotency-Key':randomUUID()});
    assert.equal(result.status,201,JSON.stringify(result));
    const order=result.data, headers={...checkoutContractHeader,'x-order-status-token':order.statusToken};
    return {order, start:()=>call(`/api/orders/swish-payment/${order.id}`,{},headers),
      status:()=>call(`/api/orders/swish-payment/${order.id}/status`,undefined,headers)};
  };
  const storedId = order => db.sql(`SELECT swish_instruction_id FROM orders WHERE id=${literal(order.id)}`);
  const paymentStatus = order => db.sql(`SELECT payment_status FROM orders WHERE id=${literal(order.id)}`);
  const callback = id => call('/api/swish/callback',{id,status:'PAID'});
  const putCount = () => swish.calls.filter(call=>call.method==='PUT').length;
  try {
    const first=await create();
    process.env.SWISH_CHECKOUT_ENABLED='false';
    const beforeDisabled=await db.sql('SELECT count(*) FROM orders');
    const blockedCreate=await call('/api/orders',{
      items:[{productId:PRODUCT,variantId:'250 gram',quantity:2}],orderType:'takeaway',
      locationId:HOJA,paymentMethod:'swish',customerInfo:{name:'Synthetic Disabled Swish',phone:'0700000099',email:'disabled@example.test'},
    },{...checkoutContractHeader,'Idempotency-Key':randomUUID()});
    assert.equal(blockedCreate.status,503);
    assert.equal((await first.start()).status,503,'Configured Swish cannot start a payment while checkout is disabled');
    assert.equal(await db.sql('SELECT count(*) FROM orders'),beforeDisabled);
    assert.equal(await storedId(first.order),'');
    assert.equal(putCount(),0,'Disabled checkout must not initiate a provider payment');
    process.env.SWISH_CHECKOUT_ENABLED='true';
    for (let attempt=0; attempt<11; attempt++) {
      const stale=await call(`/api/orders/swish-payment/${first.order.id}`,{},
        {'x-order-status-token':first.order.statusToken});
      assert.equal(stale.status,426);
      assert.equal(stale.data.code,'CLIENT_UPGRADE_REQUIRED');
    }
    assert.equal(putCount(),0,'Stale clients must not reach Swish or consume its limiter');
    const starts=await Promise.all([first.start(),first.start()]);
    assert(starts.every(result=>[200,409].includes(result.status)),JSON.stringify(starts));
    assert.equal(putCount(),1);
    const id=await storedId(first.order); assert.match(id,/^[0-9A-F]{32}$/);
    const payment=swish.payments.get(id);
    assert.equal((await callback(id)).status,409,'A forged PAID notification cannot override canonical CREATED');
    for (const [field,value] of Object.entries({amount:'0.01',currency:'EUR',payeeAlias:'1230000000',payeePaymentReference:'other-order',id:randomUUID().replaceAll('-','').toUpperCase()})) {
      const original=payment[field]; payment[field]=value;
      assert.equal((await first.status()).status,409,field);
      payment[field]=original;
    }
    payment.status='PAID';
    process.env.SWISH_CHECKOUT_ENABLED='false';
    assert.equal((await callback(id)).status,200);
    assert.equal((await callback(id)).status,200);
    assert.equal((await first.status()).status,200,'Historical status/reconciliation remains available with checkout disabled');
    assert.equal(await paymentStatus(first.order),'paid');
    assert.equal(putCount(),1);

    process.env.SWISH_CHECKOUT_ENABLED='true';
    const timeout=await create(); swish.faults.acceptedTimeout=true;
    assert.equal((await timeout.start()).status,500);
    const reserved=await storedId(timeout.order), beforeRetry=putCount();
    assert.equal((await timeout.start()).status,200,'Recover an accepted request through canonical GET');
    assert.equal(putCount(),beforeRetry);
    swish.faults.getStatus=404;
    const absent=await timeout.start();
    assert.equal(absent.status,409); assert.equal(absent.data.code,'SWISH_RECONCILIATION_REQUIRED');
    swish.faults.getStatus=500;
    assert.deepEqual(await timeout.start(),{status:500,data:{error:'Failed to create Swish payment'}});
    swish.faults.getStatus=0;
    assert.equal(await storedId(timeout.order),reserved); assert.equal(putCount(),beforeRetry);
    const accepted=swish.payments.get(reserved); accepted.currency='EUR';
    assert.equal((await timeout.start()).status,500,'Do not expose a token for an inconsistent existing payment');
    accepted.currency='SEK';

    const legacy=await create(), dashed=randomUUID(), compact=dashed.replaceAll('-','').toUpperCase();
    await db.sql(`UPDATE orders SET swish_instruction_id=${literal(dashed)} WHERE id=${literal(legacy.order.id)}`);
    swish.payments.set(compact,{...accepted,id:compact,payeePaymentReference:legacy.order.id.slice(0,35),status:'PAID'});
    process.env.SWISH_CHECKOUT_ENABLED='false';
    assert.equal((await callback(compact)).status,200);
    assert.equal(await paymentStatus(legacy.order),'paid','Compact callbacks must resolve an existing hyphenated reservation');
    assert.equal(await storedId(legacy.order),dashed,'Do not rewrite references needed for atomic reconciliation');
    assert.equal(putCount(),beforeRetry);
    await verifySwishRefundRecovery({db,call,swish,order:first.order,legacy:legacy.order,nativeFetch,origin});
    console.log('Verified disabled Swish checkout without new orders/payments, preserved historical status/callbacks/refunds, wire identity, concurrent starts, accepted timeout recovery and legacy reservations without external HTTPS.');
  } finally {
    server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); swish.close();
  }
});
