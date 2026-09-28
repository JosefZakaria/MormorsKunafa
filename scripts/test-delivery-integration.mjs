import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withTestDatabase } from './lib/local-test-database.mjs';
import { initializeSyntheticDatabase, createSyntheticApp, PRODUCT, TEST_PASSWORD, literal } from './lib/synthetic-api.mjs';

const nativeFetch = globalThis.fetch;
await withTestDatabase(async db => {
  await initializeSyntheticDatabase(db);
  const { app } = await createSyntheticApp(db);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const call = async (route, body, headers = {}, method = body === undefined ? 'GET' : 'POST') => {
    const response = await nativeFetch(origin + route, { method, headers: { 'content-type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    return { status: response.status, headers: response.headers, data: text ? JSON.parse(text) : null };
  };
  const login = async email => {
    const r = await call('/api/admin/login', { email, password: TEST_PASSWORD });
    assert.equal(r.status, 200);
    const cookie = r.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
    return { cookie, 'x-csrf-token': decodeURIComponent(cookie.match(/mk_csrf=([^;]+)/)[1]) };
  };
  let n = 0;
  const quote = feeOre => ({ feeOre, matchedCity: 'Lund', showDeliveryEstimate: false });
  const payload = () => ({ items: [{ productId: PRODUCT, variantId: '250 gram', quantity: 2, price: 1 }],
    orderType: 'delivery', paymentMethod: 'card', scheduledTime: '2030-01-01T12:00:00',
    customerInfo: { name: 'Synthetic Delivery', phone: `070000${String(++n).padStart(4,'0')}`, email: `delivery${n}@example.test` },
    deliveryInfo: { address: 'Synthetic Street 1', postalCode: '22222', city: ' lUnD ', pricing: { feeOre: 1 } },
    deliveryQuote: quote(11900) });
  const create = (body, key = randomUUID()) => call('/api/orders', body, { 'x-checkout-contract':'order-v2', 'idempotency-key':key });
  const count = () => db.sql('SELECT count(*) FROM orders');
  try {
    const owner = await login('owner@example.test'), staff = await login('mollevangen@example.test');
    const endpoint = '/api/admin/delivery-pricing';
    for (const [headers, status] of [[{},401],[staff,403]]) {
      assert.equal((await call(endpoint, undefined, headers)).status, status);
      assert.equal((await call(endpoint, {defaultFeeOre:0,cityFees:[]},headers,'PATCH')).status,status);
    }
    assert.equal((await call(endpoint,{defaultFeeOre:0,cityFees:[]},{cookie:owner.cookie},'PATCH')).status,403);
    for (const invalid of [{}, {defaultFeeOre:-1,cityFees:[]}, {defaultFeeOre:79.5,cityFees:[]},
      {defaultFeeOre:7900,cityFees:[{city:' ',feeOre:1}]},
      {defaultFeeOre:7900,cityFees:[{city:'Lund',feeOre:1},{city:' LUND ',feeOre:2}]}]) {
      assert.equal((await call(endpoint,invalid,owner,'PATCH')).status,400);
    }
    const settings = {defaultFeeOre:9950,cityFees:[{city:'Lund',feeOre:11900}]};
    assert.equal((await call(endpoint,{...settings,is_paused:true},owner,'PATCH')).status,200);
    assert.equal(await db.sql('SELECT is_paused FROM admin_settings'),'f');
    assert.deepEqual((await call(endpoint,undefined,owner)).data,settings);
    const pricing = await call('/api/orders/delivery-pricing');
    assert.equal(pricing.status,200); assert.equal(pricing.headers.get('cache-control'),'no-store');
    assert.deepEqual(pricing.data,settings);

    const before = await count();
    for (const email of [undefined,'','not-an-email']) {
      const body=payload(); body.customerInfo.email=email;
      assert.equal((await create(body)).status,400);
    }
    for (const acknowledgement of [undefined,{...quote(11900),feeOre:1},{...quote(11900),showDeliveryEstimate:true}]) {
      const r=await create({...payload(),deliveryQuote:acknowledgement});
      assert.equal(r.status,409); assert.equal(r.data.code,'DELIVERY_QUOTE_CHANGED');
    }
    assert.equal(await count(),before);
    const key=randomUUID(), body=payload();
    const created=await create(body,key);
    assert.equal(created.status,201,JSON.stringify(created.data));
    assert.equal(created.data.totalPrice,31700);
    const id=created.data.id;
    assert.equal(await db.sql(`SELECT scheduled_at IS NULL AND location_id IS NULL FROM orders WHERE id=${literal(id)}`),'t');
    const saved=JSON.parse(await db.sql(`SELECT delivery_info_json::text FROM orders WHERE id=${literal(id)}`));
    assert.deepEqual(saved.pricing,quote(11900));
    assert.deepEqual(Object.keys(saved).sort(),['address','city','postalCode','pricing']);
    const status=await call(`/api/orders/${id}`,undefined,{'x-order-status-token':created.data.statusToken});
    assert.equal(status.data.showDeliveryEstimate,false);
    assert(!JSON.stringify(status.data).includes('Lund'));
    assert(!('deliveryInfo' in status.data));

    assert.equal((await call(endpoint,{...settings,cityFees:[{city:'Lund',feeOre:14900}]},owner,'PATCH')).status,200);
    const replay=await create(body,key);
    assert.equal(replay.status,201); assert.deepEqual(replay.data,created.data);
    assert.equal(replay.headers.get('idempotent-replayed'),'true');
    assert.equal(await db.sql(`SELECT total_ore FROM orders WHERE id=${literal(id)}`),'31700');
    const retryBody=payload(),retryKey=randomUUID();
    const rejected=await create(retryBody,retryKey);
    assert.equal(rejected.status,409); assert.equal(rejected.data.code,'DELIVERY_QUOTE_CHANGED');
    const accepted=await create({...retryBody,deliveryQuote:quote(14900)},retryKey);
    assert.equal(accepted.status,201,JSON.stringify(accepted.data));
    assert.equal(accepted.data.totalPrice,34700);
    const countAfter=await count();
    assert.equal((await create({...retryBody,deliveryQuote:quote(14900)},retryKey)).data.id,accepted.data.id);
    assert.equal(await count(),countAfter);

    await call(endpoint,{...settings,cityFees:[{city:'Lund',feeOre:0}]},owner,'PATCH');
    const free=await create({...payload(),deliveryQuote:quote(0)});
    assert.equal(free.status,201,JSON.stringify(free.data)); assert.equal(free.data.totalPrice,19800);
    assert.equal(await db.sql(`SELECT count(*) FROM order_items WHERE order_id=${literal(free.data.id)} AND product_name_snapshot='Leveransavgift' AND price_ore=0`),'1');
    await assert.rejects(db.sql(`UPDATE order_items SET price_ore=0 WHERE order_id=${literal(free.data.id)} AND product_id IS NOT NULL`));
    await assert.rejects(db.sql(`UPDATE order_items SET price_ore=-1 WHERE order_id=${literal(free.data.id)} AND product_id IS NULL`));

    // A paid transition emits exactly once; replaying confirmation cannot double it.
    const {registerRealtimeClient}=await import('../backend/dist/services/realtimeEvents.js');
    const scope={adminId:'owner-test',role:'owner',locationId:null};
    let events=0;
    const cleanup=registerRealtimeClient(scope,{write(value){if(value==='event: ORDER_CREATED\n')events++;},end(){}},async()=>scope);
    try {
      const {markOrderPaid}=await import('../backend/dist/services/markOrderPaid.js');
      assert.equal(await markOrderPaid(free.data.id,{expectedAmountOre:19800,paidAmountOre:19800}),true);
      assert.equal(await markOrderPaid(free.data.id,{expectedAmountOre:19800,paidAmountOre:19800}),false);
      await new Promise(resolve=>setTimeout(resolve,100));
      assert.equal(events,1);
    } finally { cleanup(); }

    const overview = await call(`/api/orders/admin/${free.data.id}/refunds`, undefined, owner);
    assert.equal(overview.status,200,JSON.stringify(overview.data));
    const freeLine = overview.data.items.find(item=>item.isDeliveryFee);
    assert.equal(freeLine.unitPrice,0);
    assert.equal(freeLine.refundableQuantity,0);
    assert.equal(overview.data.items.find(item=>!item.isDeliveryFee).refundableQuantity,2);

    await db.sql('ALTER TABLE admin_settings RENAME COLUMN delivery_default_fee_ore TO missing_fee');
    assert.equal((await call('/api/orders/delivery-pricing')).status,503);
    // The small PostgREST adapter maps SQL errors to TEST_ADAPTER_ERROR;
    // real PostgREST's 42703/PGRST204 maps to the route's specific 503.
    assert.equal((await call(endpoint,undefined,owner)).status,500);
    assert.equal((await create({...payload(),deliveryQuote:quote(0)})).status,503);
    console.log('PASS delivery integration: scoped/CSRF settings, required email, authoritative and free fees, frozen terms, quote retry, committed replay, SQL constraints, one paid notification and missing-schema denial.');
  } finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
});
