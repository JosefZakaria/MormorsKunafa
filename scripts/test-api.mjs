import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withTestDatabase } from './lib/local-test-database.mjs';
import { initializeSyntheticDatabase, createSyntheticApp, HOJA, MOLLEVANGEN, PRODUCT, TEST_PASSWORD, literal } from './lib/synthetic-api.mjs';

const nativeFetch = globalThis.fetch;
await withTestDatabase(async db => {
  await initializeSyntheticDatabase(db);
  const { app, sessions, stripe, refunds, faults, expireRefundKeys } = await createSyntheticApp(db);
  const server = app.listen(0,'127.0.0.1');
  await new Promise(resolve => server.once('listening',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function call(route, body, headers = {}, method = body === undefined ? 'GET' : 'POST') {
    const response = await nativeFetch(origin+route, { method, headers:{'content-type':'application/json',...headers},
      ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
    const text = await response.text();
    return {status:response.status, headers:response.headers, data:text ? JSON.parse(text) : null};
  }
  const tomorrow = new Date(Date.now()+86400000).toISOString().slice(0,10)+'T14:00';
  const orderBody = { items:[{productId:PRODUCT,variantId:'250 gram',quantity:2,price:1,name:'FORGED'}],
    orderType:'takeaway',locationId:HOJA,paymentMethod:'card',scheduledTime:tomorrow,
    customerInfo:{name:'Synthetic Test',phone:'+46700000000',email:'buyer@example.test'} };
  let customerNumber = 1;
  const newOrder = body => call('/api/orders',{...body, customerInfo:{...body.customerInfo,
    phone:'+4670000'+String(customerNumber++).padStart(4,'0'), email:`buyer${customerNumber}@example.test`}}, {'Idempotency-Key':randomUUID()});
  try {
    const key = randomUUID();
    const first = await call('/api/orders',orderBody,{'Idempotency-Key':key});
    assert.equal(first.status,201,JSON.stringify(first.data));
    const id = first.data.id, token = first.data.statusToken;
    assert.equal(await db.sql(`SELECT total_ore FROM orders WHERE id='${id}'`),'19800');
    assert.equal(first.data.locationId,HOJA);
    const replay = await call('/api/orders',orderBody,{'Idempotency-Key':key});
    assert.equal(replay.data.id,id);
    assert.equal((await call(`/api/orders/${id}`)).status,401);
    const tokenHeader = {'x-order-status-token':token};
    const status = await call(`/api/orders/${id}`,undefined,tokenHeader);
    assert.equal(status.status,200,JSON.stringify(status.data));
    for (const privateField of ['customerInfo','customerPhone','customerEmail','items','deliveryInfo']) assert(!(privateField in status.data));
    assert.match(status.headers.get('cache-control'),/no-store/);
    assert.equal(status.data.paymentStatus,'pending');
    assert.equal(status.data.locationId,HOJA);
    assert.equal(status.data.orderType,'takeaway');
    assert.equal(status.data.scheduledTime,new Date(await db.sql(`SELECT scheduled_at FROM orders WHERE id='${id}'`)).toISOString());
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
    const event={id:'evt_test_'+randomUUID().replaceAll('-',''),type:'checkout.session.completed',livemode:false,data:{object:session}};
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
    for (const locationId of [HOJA,MOLLEVANGEN]) {
      for (const orderType of ['eat-here','takeaway']) assert.equal((await newOrder({...orderBody,locationId,orderType})).status,201);
    }
    await db.sql(`UPDATE locations SET is_paused=true WHERE id='${MOLLEVANGEN}'`);
    assert.equal((await newOrder({...orderBody,locationId:MOLLEVANGEN})).status,403);
    await db.sql(`UPDATE locations SET is_paused=false WHERE id='${MOLLEVANGEN}'; UPDATE product_location_stock SET in_stock=false WHERE location_id='${MOLLEVANGEN}'`);
    assert.equal((await newOrder({...orderBody,locationId:MOLLEVANGEN})).status,403);
    assert.equal((await newOrder({...orderBody,locationId:HOJA})).status,201);
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
    const cancelBody={password:TEST_PASSWORD,cancellationReason:'Synthetic cancellation'};
    assert.equal((await call(`/api/orders/admin/${id}/cancel`,cancelBody,ownerHeaders)).status,409);
    const pending=await newOrder(orderBody);
    assert.equal(pending.status,201);
    const pendingId=pending.data.id, pendingHeader={'x-order-status-token':pending.data.statusToken};
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
    const scheduledDate=tomorrow.slice(0,10);
    assert.equal((await newOrder({...orderBody,scheduledTime:scheduledDate+'T14:00+14:00'})).status,400);
    assert.equal((await newOrder({...orderBody,scheduledTime:new Date(Date.now()+40*86400000).toISOString().slice(0,10)+'T14:00'})).status,400);
    const preorder=await newOrder({...orderBody,scheduledTime:new Date(Date.now()+30*86400000).toISOString().slice(0,10)+'T14:00'});
    assert.equal(preorder.status,201,JSON.stringify(preorder.data));
    assert.equal(await db.sql(`SELECT order_status_token_expires_at > scheduled_at + interval '6 days' FROM orders WHERE id='${preorder.data.id}'`),'t');
    await db.sql("UPDATE admin_users SET token_version=token_version+1 WHERE id='mollevangen-test'");
    assert.equal((await call('/api/admin/session',undefined,adminHeaders)).status,401);
    assert.equal((await call('/api/admin/logout',{}, {cookie:ownerCookies})).status,403);
    await db.sql(`CREATE FUNCTION test_fail_revocation() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN RAISE EXCEPTION 'synthetic revocation unavailable'; END; $body$;
      CREATE TRIGGER test_fail_revocation BEFORE UPDATE OF token_version ON admin_users FOR EACH ROW EXECUTE FUNCTION test_fail_revocation()`);
    const failedLogout=await call('/api/admin/logout',{},ownerHeaders);
    assert.equal(failedLogout.status,503);
    assert.equal(failedLogout.headers.getSetCookie().length,0,'Keep credentials for a failed revocation retry');
    assert.equal(await db.sql("SELECT count(*) FROM security_audit_log WHERE actor_admin_id='owner-test' AND action='admin_logout' AND outcome='failed'"),'1');
    assert.equal((await call('/api/admin/session',undefined,ownerHeaders)).status,200);
    await db.sql('DROP TRIGGER test_fail_revocation ON admin_users; DROP FUNCTION test_fail_revocation()');
    // Disabled accounts must also be able to irrevocably end their signed session.
    await db.sql("UPDATE admin_users SET is_active=false WHERE id='owner-test'");
    assert.equal((await call('/api/admin/logout',{},ownerHeaders)).status,204);
    await db.sql("UPDATE admin_users SET is_active=true WHERE id='owner-test'");
    assert.equal((await call('/api/admin/session',undefined,ownerHeaders)).status,401);
    assert.equal((await call('/api/admin/logout',{},ownerHeaders)).status,204,'Already revoked retry succeeds without restoring access');
    console.log('Verified real HTTP routes + PostgreSQL: server pricing, replay, token privacy, concurrent checkout/confirmation, both locations, pauses/stock/hidden products, scoped refunds/status, CSRF and session revocation.');
  } finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
});
