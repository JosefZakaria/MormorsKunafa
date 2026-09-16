import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDuplicateRefundRecovery } from './lib/test-duplicate-refunds.mjs';
import { withTestDatabase } from './lib/local-test-database.mjs';
import { initializeSyntheticDatabase, createSyntheticApp, HOJA, MOLLEVANGEN, PRODUCT, TEST_PASSWORD, literal } from './lib/synthetic-api.mjs';

const nativeFetch = globalThis.fetch;
const checkoutContractHeader = {'X-Checkout-Contract':'order-v2'};

function nextStockholmDateString(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Stockholm',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
      .filter(({ type }) => type === 'year' || type === 'month' || type === 'day')
      .map(({ type, value }) => [type, value]),
  );
  return new Date(Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day) + 1,
  )).toISOString().slice(0, 10);
}

await withTestDatabase(async db => {
  await initializeSyntheticDatabase(db);
  const { app, sessions, stripe, refunds, faults, expireRefundKeys } = await createSyntheticApp(db);
  const pushRepository = await import('../backend/dist/db/pushSubscriptionsRepository.js');
  const server = app.listen(0,'127.0.0.1');
  await new Promise(resolve => server.once('listening',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function call(route, body, headers = {}, method = body === undefined ? 'GET' : 'POST') {
    const response = await nativeFetch(origin+route, { method, headers:{'content-type':'application/json',...headers},
      ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
    const text = await response.text();
    return {status:response.status, headers:response.headers, data:text ? JSON.parse(text) : null};
  }
  const tomorrow = nextStockholmDateString()+'T14:00';
  const orderBody = { items:[{productId:PRODUCT,variantId:'250 gram',quantity:2,price:1,name:'FORGED'}],
    orderType:'takeaway',locationId:HOJA,paymentMethod:'card',scheduledTime:tomorrow,
    customerInfo:{name:'Synthetic Test',phone:'+46700000000',email:'buyer@example.test'} };
  let customerNumber = 1;
  const newOrder = body => call('/api/orders',{...body, customerInfo:{...body.customerInfo,
    phone:'+4670000'+String(customerNumber++).padStart(4,'0'), email:`buyer${customerNumber}@example.test`}},
    {...checkoutContractHeader,'Idempotency-Key':randomUUID()});
  const markSyntheticOrderPaid = async orderId => {
    const marked = await db.sql(`SELECT public.mark_order_paid_with_audit(
      ${literal(orderId)}::uuid, now(), ${literal(randomUUID())}::uuid)`);
    assert.equal(marked,'t',`Synthetic order ${orderId} should be marked paid exactly once`);
  };
  const readOrderTimes = async orderId => ({
    estimatedReadyAt: await db.sql(`SELECT estimated_ready_at::text FROM orders WHERE id=${literal(orderId)}`),
    scheduledAt: await db.sql(`SELECT scheduled_at::text FROM orders WHERE id=${literal(orderId)}`),
  });
  try {
    const emptyJson = await call('/api/admin/login',undefined,{},'POST');
    assert.equal(emptyJson.status,400,JSON.stringify(emptyJson.data));
    const wrongType = await nativeFetch(origin+'/api/admin/login',{
      method:'POST',headers:{'content-type':'text/plain'},body:'not parsed as credentials',
    });
    assert.equal(wrongType.status,400);
    await wrongType.text();
    const malformedJson = await nativeFetch(origin+'/api/admin/login',{
      method:'POST',headers:{'content-type':'application/json'},body:'{',
    });
    assert.equal(malformedJson.status,400);
    assert.deepEqual(await malformedJson.json(),{error:'Invalid JSON body'});
    const oversizedJson = await nativeFetch(origin+'/api/admin/login',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({email:'a'.repeat(70*1024),password:'irrelevant'}),
    });
    assert.equal(oversizedJson.status,413);
    assert.deepEqual(await oversizedJson.json(),{error:'Request body is too large'});

    const baselineProducts = await call('/api/products');
    const nestedQuery = await call('/api/products?locationId%5Bconstructor%5D%5BisBuffer%5D=x');
    assert.equal(nestedQuery.status,200);
    assert.deepEqual(nestedQuery.data,baselineProducts.data,'Nested keys must not enter scalar query fields');

    const orderCountBeforeStaleClients = await db.sql('SELECT count(*) FROM orders');
    for (let attempt=0; attempt<16; attempt++) {
      const stale = await call('/api/orders',orderBody,{'Idempotency-Key':randomUUID()});
      assert.equal(stale.status,426,JSON.stringify(stale.data));
      assert.equal(stale.data.code,'CLIENT_UPGRADE_REQUIRED');
      assert.match(stale.headers.get('cache-control'),/private.*no-store/);
    }
    assert.equal(await db.sql('SELECT count(*) FROM orders'),orderCountBeforeStaleClients);
    const dedicatedStatusSecret = process.env.ORDER_STATUS_TOKEN_SECRET;
    assert(dedicatedStatusSecret && dedicatedStatusSecret.length >= 32);
    delete process.env.ORDER_STATUS_TOKEN_SECRET;
    const key = randomUUID();
    const first = await call('/api/orders',orderBody,{...checkoutContractHeader,'Idempotency-Key':key});
    process.env.ORDER_STATUS_TOKEN_SECRET = dedicatedStatusSecret;
    assert.equal(first.status,201,JSON.stringify(first.data));
    assert.match(first.data.statusToken,/^v1\./,'The pre-activation order models a legacy token');
    assert.equal(first.data.checkoutContract,'order-v2');
    const id = first.data.id, token = first.data.statusToken;
    for (const privateField of ['customerInfo','deliveryInfo','items','internalNotes','refunds','paymentStatus']) {
      assert(!(privateField in first.data),`Create response exposed ${privateField}`);
    }
    assert.equal(await db.sql(`SELECT total_ore FROM orders WHERE id='${id}'`),'19800');
    assert.equal(first.data.locationId,HOJA);
    const replay = await call('/api/orders',orderBody,{...checkoutContractHeader,'Idempotency-Key':key});
    assert.deepEqual(replay.data,first.data);
    assert.equal((await call(`/api/orders/${id}`)).status,401);
    const tokenHeader = {...checkoutContractHeader,'x-order-status-token':token};
    const status = await call(`/api/orders/${id}`,undefined,tokenHeader);
    assert.equal(status.status,200,JSON.stringify(status.data));
    for (const privateField of ['customerInfo','customerPhone','customerEmail','items','deliveryInfo']) assert(!(privateField in status.data));
    assert.match(status.headers.get('cache-control'),/no-store/);
    assert.equal(status.data.paymentStatus,'pending');
    assert.equal(status.data.locationId,HOJA);
    assert.equal(status.data.orderType,'takeaway');
    assert.equal(status.data.scheduledTime,new Date(await db.sql(`SELECT scheduled_at FROM orders WHERE id='${id}'`)).toISOString());
    for (let attempt=0; attempt<11; attempt++) {
      const stale = await call(`/api/orders/checkout-session/${id}`,{}, {'x-order-status-token':token});
      assert.equal(stale.status,426);
      assert.equal(stale.data.code,'CLIENT_UPGRADE_REQUIRED');
    }
    assert.equal(sessions.size,0,'Stale checkout clients must not reach Stripe');
    const parallel = await Promise.all([call(`/api/orders/checkout-session/${id}`,{},tokenHeader),call(`/api/orders/checkout-session/${id}`,{},tokenHeader)]);
    assert.equal(parallel[0].status,200,JSON.stringify(parallel[0].data));
    assert.equal(parallel[0].data.url,parallel[1].data.url);
    assert.equal(sessions.size,1);
    const session = [...sessions.values()][0];
    session.status='complete';session.payment_status='paid';
    const confirmBody={orderId:id,sessionId:session.id};
    session.amount_total=1;
    assert.equal((await call('/api/orders/stripe-confirm',confirmBody,tokenHeader)).status,400);
    assert.equal(await db.sql(`SELECT payment_status FROM orders WHERE id='${id}'`),'pending');
    session.amount_total=19800;
    const confirmations=await Promise.all([call('/api/orders/stripe-confirm',confirmBody,tokenHeader),call('/api/orders/stripe-confirm',confirmBody,tokenHeader)]);
    assert.equal(confirmations[0].status,200,JSON.stringify(confirmations[0].data));
    assert.equal(await db.sql(`SELECT count(*) FROM security_audit_log WHERE resource_id='${id}' AND action='stripe_payment_confirmed'`),'1');
    assert.equal(
      await db.sql(`SELECT string_agg(event_key || ':' || channel, ',' ORDER BY channel)
        FROM outbound_message_jobs WHERE order_id=${literal(id)}`),
      'order_confirmation:email,order_confirmation:sms',
      'Concurrent payment confirmation must atomically create one job per customer channel'
    );
    assert.equal(await db.sql(`SELECT receipt_vat_rate_percent::text || ':' || receipt_vat_ore::text FROM orders WHERE id='${id}'`),'6:1121');
    const event={id:'evt_test_'+randomUUID().replaceAll('-',''),type:'checkout.session.completed',livemode:false,data:{object:session}};
    const wrongModeEvent={...event,id:'evt_test_'+randomUUID().replaceAll('-',''),livemode:true};
    const wrongModePayload=JSON.stringify(wrongModeEvent);
    const wrongModeSignature=stripe.webhooks.generateTestHeaderString({payload:wrongModePayload,secret:process.env.STRIPE_WEBHOOK_SECRET});
    const wrongModeReply=await nativeFetch(origin+'/api/stripe/webhook',{method:'POST',
      headers:{'content-type':'application/json','stripe-signature':wrongModeSignature},body:wrongModePayload});
    assert.equal(wrongModeReply.status,400,'A signed live event must fail closed in the synthetic test deployment');
    assert.equal(await wrongModeReply.text(),'Webhook mode mismatch');
    assert.equal(await db.sql(`SELECT count(*) FROM payment_provider_events WHERE event_id='${wrongModeEvent.id}'`),'0');
    const payload=JSON.stringify(event);
    const signature=stripe.webhooks.generateTestHeaderString({payload,secret:process.env.STRIPE_WEBHOOK_SECRET});
    const webhook=()=>nativeFetch(origin+'/api/stripe/webhook',{method:'POST',headers:{'content-type':'application/json','stripe-signature':signature},body:payload});
    const held=JSON.parse(await db.sql(`SELECT claim_stripe_event_v2('${event.id}','${event.type}',false)`));
    const busy=await webhook();
    assert.equal(busy.status,503,'A live lease must remain retryable');
    assert.equal(busy.headers.get('retry-after'),'30');
    await busy.text();
    await db.sql(`SELECT fail_stripe_event_v2('${event.id}','${held.token}')`);
    const callbacks=await Promise.all([webhook(),webhook()]);
    assert(callbacks.some(r=>r.status===200));
    assert(callbacks.every(r=>[200,503].includes(r.status)));
    await Promise.all(callbacks.map(r=>r.text()));
    const duplicate=await webhook();
    assert.equal(duplicate.status,200);
    assert.equal((await duplicate.json()).duplicate,true);
    assert.equal(await db.sql(`SELECT count(*) FROM security_audit_log WHERE resource_id='${id}' AND action='stripe_payment_confirmed'`),'1');
    const createdLocationOrders=[];
    for (const locationId of [HOJA,MOLLEVANGEN]) {
      for (const orderType of ['eat-here','takeaway']) {
        const created=await newOrder({...orderBody,locationId,orderType});
        assert.equal(created.status,201,JSON.stringify(created.data));
        createdLocationOrders.push({locationId,orderType,response:created});
      }
    }
    await db.sql(`UPDATE locations SET is_paused=true WHERE id='${MOLLEVANGEN}'`);
    assert.equal((await newOrder({...orderBody,locationId:MOLLEVANGEN})).status,403);
    await db.sql(`UPDATE locations SET is_paused=false WHERE id='${MOLLEVANGEN}'; UPDATE product_location_stock SET in_stock=false WHERE location_id='${MOLLEVANGEN}'`);
    assert.equal((await newOrder({...orderBody,locationId:MOLLEVANGEN})).status,403);
    const hojaStockOrder=await newOrder({...orderBody,locationId:HOJA});
    assert.equal(hojaStockOrder.status,201,JSON.stringify(hojaStockOrder.data));
    await db.sql(`UPDATE products SET hidden=true WHERE id='${PRODUCT}'`);
    assert.equal((await newOrder(orderBody)).status,409);
    await db.sql(`UPDATE products SET hidden=false WHERE id='${PRODUCT}'`);
    const login = await call('/api/admin/login',{email:'mollevangen@example.test',password:TEST_PASSWORD});
    assert.equal(login.status,200,JSON.stringify(login.data));
    const cookies = login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
    const csrf = cookies.match(/mk_csrf=([^;]+)/)[1];
    const adminHeaders={cookie:cookies,'x-csrf-token':decodeURIComponent(csrf)};
    for (const route of [`/api/orders/admin/${id}/refunds`,`/api/orders/admin/${id}/revoke-status-token`,`/api/orders/admin/${id}/status`]) {
      const response = await call(route,route.endsWith('refunds') ? undefined : {status:'klar'},adminHeaders,route.endsWith('status')?'PATCH':route.endsWith('refunds')?'GET':'POST');
      assert.equal(response.status,404,route+':'+JSON.stringify(response.data));
    }
    assert.equal((await call('/api/admin/settings',{isPaused:true},{cookie:cookies},'PATCH')).status,403);
    assert.equal((await call('/api/admin/payment-alerts',undefined,adminHeaders)).status,403);
    const ownerLogin = await call('/api/admin/login',{email:'owner@example.test',password:TEST_PASSWORD});
    assert.equal(ownerLogin.status,200);
    const ownerCookies=ownerLogin.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
    const ownerHeaders={cookie:ownerCookies,'x-csrf-token':decodeURIComponent(ownerCookies.match(/mk_csrf=([^;]+)/)[1])};
    const hojaLogin = await call('/api/admin/login',{email:'hoja@example.test',password:TEST_PASSWORD});
    assert.equal(hojaLogin.status,200,JSON.stringify(hojaLogin.data));
    const hojaCookies=hojaLogin.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
    const hojaHeaders={cookie:hojaCookies,'x-csrf-token':decodeURIComponent(hojaCookies.match(/mk_csrf=([^;]+)/)[1])};
    for (const integrationKey of ['RESEND_API_KEY','SINCH_PROJECT_ID','WEB_PUSH_VAPID_PRIVATE_KEY']) {
      assert.equal(process.env[integrationKey],undefined,`${integrationKey} must stay disabled in the synthetic run`);
    }
    const maintenanceSecret='synthetic-maintenance-secret-with-32-bytes';
    process.env.CRON_SECRET=maintenanceSecret;
    const deniedOutboundRun=await call('/api/internal/maintenance/process-outbound-messages');
    assert.equal(deniedOutboundRun.status,401,JSON.stringify(deniedOutboundRun.data));
    assert.match(deniedOutboundRun.headers.get('cache-control'),/private.*no-store/);
    const outboundRun=await call('/api/internal/maintenance/process-outbound-messages',undefined, {
      authorization:`Bearer ${maintenanceSecret}`,
    });
    assert.equal(outboundRun.status,200,JSON.stringify(outboundRun.data));
    assert.equal(outboundRun.data.claimed,2);
    assert.equal(outboundRun.data.outcomes.permanent_failed,2);
    assert.equal(
      await db.sql(`SELECT count(*) FROM outbound_message_jobs
        WHERE order_id=${literal(id)} AND status='permanent_failed'
          AND attempt_count=1 AND last_error_code='provider_not_configured'`),
      '2',
      'Provider downtime/configuration must remain visible without rolling back the paid order'
    );
    assert.equal(
      await db.sql(`SELECT payment_status FROM orders WHERE id=${literal(id)}`),
      'paid',
      'Message provider failure must not affect the order transition'
    );

    const preservedPreorder=hojaStockOrder;
    await db.sql(`UPDATE orders SET estimated_ready_at=estimated_ready_at+interval '0.123456 seconds'
      WHERE id=${literal(preservedPreorder.data.id)}`);
    await markSyntheticOrderPaid(preservedPreorder.data.id);
    const preservedBefore=await readOrderTimes(preservedPreorder.data.id);
    const hojaPendingBefore=await call('/api/orders/admin/pending',undefined,hojaHeaders);
    assert.equal(hojaPendingBefore.status,200,JSON.stringify(hojaPendingBefore.data));
    assert(
      hojaPendingBefore.data.some(order=>order.id===preservedPreorder.data.id),
      'A future paid preorder must be available in its location acceptance queue'
    );
    const wrongLocationPending=await call('/api/orders/admin/pending',undefined,adminHeaders);
    assert.equal(wrongLocationPending.status,200,JSON.stringify(wrongLocationPending.data));
    assert(
      !wrongLocationPending.data.some(order=>order.id===preservedPreorder.data.id),
      'A future paid preorder must not leak into another location queue'
    );
    const deniedAccept=await call(
      `/api/orders/admin/${preservedPreorder.data.id}/accept`,{},adminHeaders,'PATCH'
    );
    assert.equal(deniedAccept.status,403,JSON.stringify(deniedAccept.data));
    assert.equal(
      await db.sql(`SELECT status FROM orders WHERE id=${literal(preservedPreorder.data.id)}`),
      'ny',
      'A different location must not acknowledge the preorder'
    );
    assert.deepEqual(await readOrderTimes(preservedPreorder.data.id),preservedBefore);

    const acceptedWithoutAdjustment=await call(
      `/api/orders/admin/${preservedPreorder.data.id}/accept`,{},hojaHeaders,'PATCH'
    );
    assert.equal(acceptedWithoutAdjustment.status,200,JSON.stringify(acceptedWithoutAdjustment.data));
    assert.equal(acceptedWithoutAdjustment.data.status,'mottagen');
    assert.equal(
      await db.sql(`SELECT count(*) FROM outbound_message_jobs
        WHERE order_id=${literal(preservedPreorder.data.id)}
          AND event_key='order_accepted' AND channel='sms'`),
      '1'
    );
    assert.deepEqual(
      await readOrderTimes(preservedPreorder.data.id),
      preservedBefore,
      'Accepting without a staff adjustment must not rewrite either promised timestamp'
    );
    const publicAccepted=await call(`/api/orders/${preservedPreorder.data.id}`,undefined,{
      'x-order-status-token':preservedPreorder.data.statusToken,
    });
    assert.equal(publicAccepted.status,200,JSON.stringify(publicAccepted.data));
    assert.equal(publicAccepted.data.estimatedReadyTime,new Date(preservedBefore.estimatedReadyAt).toISOString());
    assert.equal(publicAccepted.data.scheduledTime,new Date(preservedBefore.scheduledAt).toISOString());

    const [hojaPendingAfter,hojaActiveAfter,hojaPreordersAfter,otherActiveAfter,otherPreordersAfter]=await Promise.all([
      call('/api/orders/admin/pending',undefined,hojaHeaders),
      call('/api/orders/admin/active',undefined,hojaHeaders),
      call('/api/orders/admin/pre-orders',undefined,hojaHeaders),
      call('/api/orders/admin/active',undefined,adminHeaders),
      call('/api/orders/admin/pre-orders',undefined,adminHeaders),
    ]);
    for (const response of [hojaPendingAfter,hojaActiveAfter,hojaPreordersAfter,otherActiveAfter,otherPreordersAfter]) {
      assert.equal(response.status,200,JSON.stringify(response.data));
    }
    assert(!hojaPendingAfter.data.some(order=>order.id===preservedPreorder.data.id));
    assert(hojaActiveAfter.data.some(order=>order.id===preservedPreorder.data.id && order.status==='mottagen'));
    assert(hojaPreordersAfter.data.some(order=>order.id===preservedPreorder.data.id && order.status==='mottagen'));
    assert(!otherActiveAfter.data.some(order=>order.id===preservedPreorder.data.id));
    assert(!otherPreordersAfter.data.some(order=>order.id===preservedPreorder.data.id));

    const adjustedPreorder=createdLocationOrders.find(order=>order.locationId===HOJA && order.orderType==='takeaway')?.response;
    assert(adjustedPreorder,'The setup must provide a future Höja takeaway preorder');
    await markSyntheticOrderPaid(adjustedPreorder.data.id);
    const adjustedBefore=await readOrderTimes(adjustedPreorder.data.id);
    const explicitAdjustment=await call(
      `/api/orders/admin/${adjustedPreorder.data.id}/accept`,{extraMinutes:5},hojaHeaders,'PATCH'
    );
    assert.equal(explicitAdjustment.status,200,JSON.stringify(explicitAdjustment.data));
    const adjustedAfter=await readOrderTimes(adjustedPreorder.data.id);
    assert.equal(
      new Date(adjustedAfter.estimatedReadyAt).getTime()-new Date(adjustedBefore.estimatedReadyAt).getTime(),
      5*60_000,
      'An explicit adjustment must move the stored ready time by exactly the requested amount'
    );
    assert.equal(adjustedAfter.scheduledAt,adjustedBefore.scheduledAt);
    assert.equal(explicitAdjustment.data.estimatedReadyTime,new Date(adjustedAfter.estimatedReadyAt).toISOString());
    assert.equal(
      await db.sql(`SELECT count(*) FROM outbound_message_jobs
        WHERE order_id=${literal(adjustedPreorder.data.id)}
          AND event_key='order_accepted' AND channel='sms'`),
      '1'
    );

    const concurrentPreorder=createdLocationOrders.find(order=>order.locationId===HOJA && order.orderType==='eat-here')?.response;
    assert(concurrentPreorder,'The setup must provide a second future Höja preorder');
    await markSyntheticOrderPaid(concurrentPreorder.data.id);
    const concurrentBefore=await readOrderTimes(concurrentPreorder.data.id);
    const concurrentAccepts=await Promise.all([
      call(`/api/orders/admin/${concurrentPreorder.data.id}/accept`,{},hojaHeaders,'PATCH'),
      call(`/api/orders/admin/${concurrentPreorder.data.id}/accept`,{},hojaHeaders,'PATCH'),
    ]);
    assert.equal(concurrentAccepts.filter(response=>response.status===200).length,1,JSON.stringify(concurrentAccepts));
    assert(
      concurrentAccepts.filter(response=>response.status!==200).every(response=>[400,409].includes(response.status)),
      JSON.stringify(concurrentAccepts)
    );
    assert.equal(
      await db.sql(`SELECT status FROM orders WHERE id=${literal(concurrentPreorder.data.id)}`),
      'mottagen'
    );
    assert.equal(
      await db.sql(`SELECT count(*) FROM outbound_message_jobs
        WHERE order_id=${literal(concurrentPreorder.data.id)}
          AND event_key='order_accepted' AND channel='sms'`),
      '1',
      'Concurrent acceptance must create exactly one acceptance-message job'
    );
    assert.deepEqual(await readOrderTimes(concurrentPreorder.data.id),concurrentBefore);

    const ownerPreorders=await call('/api/orders/admin/pre-orders',undefined,ownerHeaders);
    assert.equal(ownerPreorders.status,200,JSON.stringify(ownerPreorders.data));
    assert(ownerPreorders.data.some(order=>order.id===id),'A paid order must remain in the durable owner queue when notifications are unavailable');
    const paidQueueOrder=ownerPreorders.data.find(order=>order.id===id);
    assert.equal(`${paidQueueOrder.receiptVatRate}:${paidQueueOrder.receiptVatAmount}`,'6:1121');
    const otherLocationPreorders=await call('/api/orders/admin/pre-orders',undefined,adminHeaders);
    assert.equal(otherLocationPreorders.status,200,JSON.stringify(otherLocationPreorders.data));
    assert(!otherLocationPreorders.data.some(order=>order.id===id),'A different location must not see the paid order');
    const protectedOrderCount=await db.sql('SELECT count(*) FROM orders');
    for (const route of [`/api/orders/admin/${id}/delete`,'/api/orders/admin/history/all/delete']) {
      const blocked=await call(route,{password:TEST_PASSWORD},ownerHeaders);
      assert.equal(blocked.status,409,JSON.stringify(blocked.data));
      assert.equal(blocked.data.code,'ACCOUNTING_HISTORY_PROTECTED');
    }
    assert.equal(await db.sql('SELECT count(*) FROM orders'),protectedOrderCount,'Legacy delete routes must not remove order history');
    const pushBody={subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/synthetic-test',keys:{
      p256dh:Buffer.alloc(65,1).toString('base64url'),auth:Buffer.alloc(16,2).toString('base64url')}},deviceLabel:'Synthetic tablet'};
    assert.equal((await call('/api/admin/push-subscriptions',pushBody,{cookie:cookies})).status,403);
    assert.equal((await call('/api/admin/push-subscriptions',{subscription:{...pushBody.subscription,endpoint:'https://127.0.0.1/push'}},adminHeaders)).status,400);
    const pushSaved=await call('/api/admin/push-subscriptions',pushBody,adminHeaders);
    assert.equal(pushSaved.status,201,JSON.stringify(pushSaved.data));
    const ownPush=await call('/api/admin/push-subscriptions',undefined,adminHeaders);
    assert.equal(ownPush.data.length,1);
    assert.match(ownPush.headers.get('cache-control'),/private.*no-store/);
    assert.equal((await call('/api/admin/push-subscriptions',undefined,ownerHeaders)).data.length,0);
    await call(`/api/admin/push-subscriptions/${pushSaved.data.id}`,undefined,ownerHeaders,'DELETE');
    assert.equal((await call('/api/admin/push-subscriptions',undefined,adminHeaders)).data.length,1,'Another admin cannot disable this subscription');
    assert.equal((await call(`/api/admin/push-subscriptions/${pushSaved.data.id}`,undefined,adminHeaders,'DELETE')).status,204);
    assert.equal((await call('/api/admin/push-subscriptions',undefined,adminHeaders)).data.length,0);
    const transferredPushBody={...pushBody,subscription:{...pushBody.subscription,
      endpoint:'https://fcm.googleapis.com/fcm/send/synthetic-transfer'}};
    assert.equal((await call('/api/admin/push-subscriptions',transferredPushBody,adminHeaders)).status,201);
    const stalePushSnapshot=(await pushRepository.listActivePushSubscriptions('mollevangen-test'))
      .find(subscription=>subscription.endpoint===transferredPushBody.subscription.endpoint);
    assert(stalePushSnapshot,'Expected a listed push subscription before transfer');
    assert.equal(await pushRepository.isPushSubscriptionCurrent(stalePushSnapshot),true);
    assert.equal((await call('/api/admin/push-subscriptions',transferredPushBody,ownerHeaders)).status,201);
    assert.equal(await pushRepository.isPushSubscriptionCurrent(stalePushSnapshot),false,
      'A delivery snapshot must become stale when another account takes the endpoint');
    await pushRepository.disablePushSubscriptionIfCurrent(stalePushSnapshot);
    assert.equal(await db.sql(`SELECT count(*) FROM admin_push_subscriptions
      WHERE endpoint=${literal(transferredPushBody.subscription.endpoint)} AND disabled_at IS NULL`),'1');
    assert.equal(await db.sql(`SELECT admin_id FROM admin_push_subscriptions
      WHERE endpoint=${literal(transferredPushBody.subscription.endpoint)} AND disabled_at IS NULL`),'owner-test');
    assert.equal((await call('/api/admin/push-subscriptions',undefined,adminHeaders)).data.length,0,
      'The old account must lose an endpoint transferred in the same browser');
    const concurrentPushBody={...pushBody,subscription:{...pushBody.subscription,
      endpoint:'https://fcm.googleapis.com/fcm/send/synthetic-concurrent'}};
    const concurrentPushRegistrations=await Promise.all([
      call('/api/admin/push-subscriptions',concurrentPushBody,adminHeaders),
      call('/api/admin/push-subscriptions',concurrentPushBody,hojaHeaders),
    ]);
    assert(concurrentPushRegistrations.every(response=>response.status===201),JSON.stringify(concurrentPushRegistrations));
    assert.equal(await db.sql(`SELECT count(*) FROM admin_push_subscriptions
      WHERE endpoint=${literal(concurrentPushBody.subscription.endpoint)} AND disabled_at IS NULL`),'1',
      'Concurrent account registration must leave exactly one active binding');
    assert.equal((await call('/api/admin/push-subscriptions',concurrentPushBody,ownerHeaders)).status,201);
    assert.equal(await db.sql(`SELECT admin_id FROM admin_push_subscriptions
      WHERE endpoint=${literal(concurrentPushBody.subscription.endpoint)} AND disabled_at IS NULL`),'owner-test');
    const foreignPushBody={...pushBody,subscription:{...pushBody.subscription,
      endpoint:'https://fcm.googleapis.com/fcm/send/synthetic-foreign-logout'}};
    assert.equal((await call('/api/admin/push-subscriptions',foreignPushBody,adminHeaders)).status,201);
    assert.equal((await call('/api/admin/logout',{pushEndpoint:foreignPushBody.subscription.endpoint},hojaHeaders)).status,204);
    assert.equal(await db.sql(`SELECT admin_id FROM admin_push_subscriptions
      WHERE endpoint=${literal(foreignPushBody.subscription.endpoint)} AND disabled_at IS NULL`),'mollevangen-test',
      'Logout must not disable another account\'s endpoint');
    const hojaRelogin = await call('/api/admin/login',{email:'hoja@example.test',password:TEST_PASSWORD});
    assert.equal(hojaRelogin.status,200,JSON.stringify(hojaRelogin.data));
    const hojaReloginCookies=hojaRelogin.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
    const hojaReloginHeaders={cookie:hojaReloginCookies,
      'x-csrf-token':decodeURIComponent(hojaReloginCookies.match(/mk_csrf=([^;]+)/)[1])};
    assert.equal((await call('/api/admin/logout',{
      pushEndpoint:'https://unsupported-provider.example.test/push',
    },hojaReloginHeaders)).status,204,
      'An unallowlisted browser endpoint must not block session revocation');
    assert.equal((await call('/api/admin/session',undefined,hojaReloginHeaders)).status,401);
    const hojaLegacyRelogin = await call('/api/admin/login',{email:'hoja@example.test',password:TEST_PASSWORD});
    assert.equal(hojaLegacyRelogin.status,200,JSON.stringify(hojaLegacyRelogin.data));
    const hojaLegacyCookies=hojaLegacyRelogin.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
    const hojaLegacyHeaders={cookie:hojaLegacyCookies,
      'x-csrf-token':decodeURIComponent(hojaLegacyCookies.match(/mk_csrf=([^;]+)/)[1])};
    assert.equal((await call('/api/admin/logout',{},hojaLegacyHeaders)).status,204,
      'Older clients without a push endpoint must still revoke their session');
    const cancelBody={password:TEST_PASSWORD,cancellationReason:'Synthetic cancellation'};
    assert.equal((await call(`/api/orders/admin/${id}/cancel`,cancelBody,ownerHeaders)).status,409);
    const pending=await newOrder(orderBody);
    assert.equal(pending.status,201);
    assert.match(pending.data.statusToken,/^v2\./,'Post-activation orders use the separate signing key');
    const pendingId=pending.data.id, pendingHeader={...checkoutContractHeader,'x-order-status-token':pending.data.statusToken};
    for (const method of ['card','app','swish']) {
      await db.sql(`UPDATE orders SET payment_method='${method}' WHERE id='${pendingId}'`);
      assert.equal((await call(`/api/orders/admin/${pendingId}/cancel`,cancelBody,ownerHeaders)).status,409);
    }
    await db.sql(`UPDATE orders SET payment_method='card' WHERE id='${pendingId}'`);
    assert.equal((await call(`/api/orders/checkout-session/${pendingId}`,{},pendingHeader)).status,200);
    assert.equal((await call(`/api/orders/admin/${pendingId}/cancel`,cancelBody,ownerHeaders)).status,409);
    // Reconstruct a cancelled historical checkout without weakening the trigger.
    await db.sql(`UPDATE orders SET status='avbruten',payment_status='paid',refund_status='refunded' WHERE id='${pendingId}';
      UPDATE orders SET payment_status='pending',refund_status='none' WHERE id='${pendingId}'`);
    const sessionCount=sessions.size;
    assert.equal((await call(`/api/orders/checkout-session/${pendingId}`,{},pendingHeader)).status,409);
    assert.equal(sessions.size,sessionCount);
    const lateSession=[...sessions.values()].find(s=>s.metadata.orderId===pendingId);
    lateSession.payment_status='paid'; lateSession.status='complete';
    for (let repeat=0;repeat<2;repeat++) assert.equal((await call('/api/orders/stripe-confirm',
      {orderId:pendingId,sessionId:lateSession.id},pendingHeader)).status,200);
    assert.equal(await db.sql(`SELECT status || ':' || payment_status FROM orders WHERE id='${pendingId}'`),'avbruten:paid');
    assert.equal(await db.sql(`SELECT count(*) FROM security_audit_log WHERE resource_id='${pendingId}' AND action='stripe_payment_confirmed'`),'1');
    const cash=await newOrder(orderBody);
    assert.equal(cash.status,201);
    await db.sql(`UPDATE orders SET payment_method='cash',refund_status=NULL WHERE id='${cash.data.id}'`);
    const { fetchOrderRow, compareAndUpdateOrder } = await import('../backend/dist/db/orderRepository.js');
    const stale=await fetchOrderRow(cash.data.id);
    await db.sql(`UPDATE orders SET payment_method='card',payment_status='paid' WHERE id='${cash.data.id}'`);
    assert.equal(await compareAndUpdateOrder(cash.data.id,'ny',{status:'avbruten'},stale),false);
    await db.sql(`UPDATE orders SET payment_method='cash',payment_status='pending' WHERE id='${cash.data.id}'`);
    assert.equal((await call(`/api/orders/admin/${cash.data.id}/cancel`,cancelBody,ownerHeaders)).status,200);
    const itemId=await db.sql(`SELECT id FROM order_items WHERE order_id='${id}'`);
    const refundBody={password:TEST_PASSWORD,confirmation:`ÅTERBETALA ${first.data.orderNumber}`,items:[{orderItemId:itemId,quantity:1}]};
    faults.refundTimeout=true;
    const refundKey=randomUUID();
    const partial=await call(`/api/orders/admin/${id}/refunds`,refundBody,{...ownerHeaders,'Idempotency-Key':refundKey});
    assert.equal(partial.status,202,JSON.stringify(partial.data));
    assert.equal(refunds.size,1);
    assert.equal(await db.sql(`SELECT status FROM order_refunds WHERE id=${literal(partial.data.refundId)}`),'pending');
    await db.sql(`UPDATE order_refunds SET created_at=now()-interval '2 days' WHERE id=${literal(partial.data.refundId)}`);
    expireRefundKeys();
    faults.hideRefunds=true;
    const oldReplay=await call(`/api/orders/admin/${id}/refunds`,refundBody,{...ownerHeaders,'Idempotency-Key':refundKey});
    assert.equal(oldReplay.status,409,JSON.stringify(oldReplay.data));
    assert.equal(oldReplay.data.code,'REFUND_RECONCILIATION_REQUIRED');
    assert.equal((await call(`/api/orders/admin/${id}/refunds/${partial.data.refundId}/reconcile`,refundBody,ownerHeaders)).status,409);
    assert.equal(faults.refundCreateCalls,1,'Expired ambiguity must not initiate another transfer');
    assert.equal(await db.sql(`SELECT status FROM order_refunds WHERE id=${literal(partial.data.refundId)}`),'pending');
    faults.hideRefunds=false;
    const reconciled=await call(`/api/orders/admin/${id}/refunds/${partial.data.refundId}/reconcile`,refundBody,ownerHeaders);
    assert.equal(reconciled.status,200,JSON.stringify(reconciled.data));
    assert.equal(refunds.size,1);
    assert.equal(faults.refundCreateCalls,1,'Recover the canonical refund after provider key expiry');
    assert.equal(await db.sql(`SELECT refunded_amount_ore FROM orders WHERE id='${id}'`),'9900');
    const full=await Promise.all([1,2].map(()=>call(`/api/orders/admin/${id}/refunds`,refundBody,{...ownerHeaders,'Idempotency-Key':randomUUID()})));
    assert(full.some(r=>r.status===200),JSON.stringify(full));
    assert.equal(refunds.size,2);
    assert.equal(await db.sql(`SELECT refunded_amount_ore FROM orders WHERE id='${id}'`),'19800');
    assert.equal(await db.sql(`SELECT status FROM orders WHERE id='${id}'`),'avbruten');
    const completedReplay=await call(`/api/orders/admin/${id}/refunds`,refundBody,{...ownerHeaders,'Idempotency-Key':refundKey});
    assert.equal(completedReplay.status,200,JSON.stringify(completedReplay.data));
    assert.equal(completedReplay.data.refundId,partial.data.refundId);
    await testDuplicateRefundRecovery({ db, call, stripe, sessions, refunds, faults, expireRefundKeys, orderId: id, ownerHeaders, staffHeaders: adminHeaders });
    const scheduledDate=tomorrow.slice(0,10);
    assert.equal((await newOrder({...orderBody,scheduledTime:scheduledDate+'T14:00+14:00'})).status,400);
    assert.equal((await newOrder({...orderBody,scheduledTime:new Date(Date.now()+40*86400000).toISOString().slice(0,10)+'T14:00'})).status,400);
    const preorder=await newOrder({...orderBody,scheduledTime:new Date(Date.now()+30*86400000).toISOString().slice(0,10)+'T14:00'});
    assert.equal(preorder.status,201,JSON.stringify(preorder.data));
    assert.equal(await db.sql(`SELECT order_status_token_expires_at > scheduled_at + interval '6 days' FROM orders WHERE id='${preorder.data.id}'`),'t');
    const racingPushBody={...pushBody,subscription:{...pushBody.subscription,
      endpoint:'https://fcm.googleapis.com/fcm/send/synthetic-register-logout-race'}};
    const registrationBlocker=db.sql(`BEGIN;
      SELECT pg_advisory_xact_lock(hashtextextended(${literal(racingPushBody.subscription.endpoint)},0));
      SELECT pg_sleep(4);
      COMMIT`);
    let blockerReady=false;
    for (let attempt=0;attempt<80 && !blockerReady;attempt++) {
      blockerReady=(await db.sql("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND granted"))!=='0';
      if (!blockerReady) await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert(blockerReady,'Registration race blocker did not acquire its advisory lock');
    const racingRegistration=call('/api/admin/push-subscriptions',racingPushBody,adminHeaders);
    let registrationWaiting=false;
    for (let attempt=0;attempt<60 && !registrationWaiting;attempt++) {
      registrationWaiting=(await db.sql("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND NOT granted"))!=='0';
      if (!registrationWaiting) await new Promise(resolve=>setTimeout(resolve,50));
    }
    const racingLogout=call('/api/admin/logout',{
      pushEndpoint:racingPushBody.subscription.endpoint,
    },adminHeaders);
    const [,registrationResult,logoutResult]=await Promise.all([
      registrationBlocker,racingRegistration,racingLogout,
    ]);
    assert(registrationWaiting,'Registration did not reach the barrier before logout');
    assert.equal(registrationResult.status,201,JSON.stringify(registrationResult.data));
    assert.equal(logoutResult.status,204,JSON.stringify(logoutResult.data));
    assert.equal(await db.sql(`SELECT count(*) FROM admin_push_subscriptions
      WHERE endpoint=${literal(racingPushBody.subscription.endpoint)} AND disabled_at IS NULL`),'0',
      'Logout must win after an already authenticated registration completes');
    assert.equal((await call('/api/admin/session',undefined,adminHeaders)).status,401,
      'The registration race must not preserve the old session');
    assert.equal((await call('/api/admin/logout',{}, {cookie:ownerCookies})).status,403);
    await db.sql(`CREATE FUNCTION test_fail_revocation() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN RAISE EXCEPTION 'synthetic revocation unavailable'; END; $body$;
      CREATE TRIGGER test_fail_revocation BEFORE UPDATE OF token_version ON admin_users FOR EACH ROW EXECUTE FUNCTION test_fail_revocation()`);
    const logoutPushA={...pushBody,subscription:{...pushBody.subscription,
      endpoint:'https://fcm.googleapis.com/fcm/send/synthetic-logout-a'}};
    const logoutPushB={...pushBody,subscription:{...pushBody.subscription,
      endpoint:'https://fcm.googleapis.com/fcm/send/synthetic-logout-b'}};
    assert.equal((await call('/api/admin/push-subscriptions',logoutPushA,ownerHeaders)).status,201);
    assert.equal((await call('/api/admin/push-subscriptions',logoutPushB,ownerHeaders)).status,201);
    const failedLogout=await call('/api/admin/logout',{pushEndpoint:logoutPushA.subscription.endpoint},ownerHeaders);
    assert.equal(failedLogout.status,503);
    assert.equal(failedLogout.headers.getSetCookie().length,0,'Keep credentials for a failed revocation retry');
    assert.equal(await db.sql(`SELECT count(*) FROM admin_push_subscriptions
      WHERE endpoint IN (${literal(logoutPushA.subscription.endpoint)},${literal(logoutPushB.subscription.endpoint)})
        AND disabled_at IS NULL`),'2','A failed logout must not partially disable this device');
    assert.equal(await db.sql("SELECT count(*) FROM security_audit_log WHERE actor_admin_id='owner-test' AND action='admin_logout' AND outcome='failed'"),'1');
    assert.equal((await call('/api/admin/session',undefined,ownerHeaders)).status,200);
    await db.sql('DROP TRIGGER test_fail_revocation ON admin_users; DROP FUNCTION test_fail_revocation()');
    // Disabled accounts must also be able to irrevocably end their signed session.
    await db.sql("UPDATE admin_users SET is_active=false WHERE id='owner-test'");
    assert.equal((await call('/api/admin/logout',{pushEndpoint:logoutPushA.subscription.endpoint},ownerHeaders)).status,204);
    assert.equal(await db.sql(`SELECT count(*) FROM admin_push_subscriptions
      WHERE endpoint=${literal(logoutPushA.subscription.endpoint)} AND disabled_at IS NULL`),'0');
    assert.equal(await db.sql(`SELECT count(*) FROM admin_push_subscriptions
      WHERE endpoint=${literal(logoutPushB.subscription.endpoint)} AND disabled_at IS NULL`),'1',
      'Logout must disable only the endpoint sent by the current device');
    await db.sql("UPDATE admin_users SET is_active=true WHERE id='owner-test'");
    assert.equal((await call('/api/admin/session',undefined,ownerHeaders)).status,401);
    assert.equal((await call('/api/admin/logout',{pushEndpoint:logoutPushB.subscription.endpoint},ownerHeaders)).status,204,
      'Already revoked retry succeeds without restoring access');
    assert.equal(await db.sql(`SELECT count(*) FROM admin_push_subscriptions
      WHERE endpoint=${literal(logoutPushB.subscription.endpoint)} AND disabled_at IS NULL`),'0');
    console.log('Verified real HTTP routes + PostgreSQL: server pricing, replay, token privacy, concurrent checkout/confirmation, both locations, pauses/stock/hidden products, scoped refunds/status, CSRF and session revocation.');
  } finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
});
