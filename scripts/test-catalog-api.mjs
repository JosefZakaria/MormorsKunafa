import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withTestDatabase } from './lib/local-test-database.mjs';
import { initializeSyntheticDatabase, createSyntheticApp, CUSTOM_BREAD, HOJA, MOLLEVANGEN, PRODUCT, TEST_PASSWORD, literal } from './lib/synthetic-api.mjs';
import { verifyLargeStatistics } from './lib/test-large-statistics.mjs';

const nativeFetch = globalThis.fetch;
const checkoutContractHeader = {'X-Checkout-Contract':'order-v2'};
await withTestDatabase(async db => {
  await initializeSyntheticDatabase(db);
  const { app } = await createSyntheticApp(db);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const call = async (route, body, headers = {}, method = body === undefined ? 'GET' : 'POST') => {
    const response = await nativeFetch(origin + route, {method,headers:{'content-type':'application/json',...headers},
      ...(body === undefined ? {} : {body:JSON.stringify(body)})});
    const text = await response.text();
    return {status:response.status,headers:response.headers,data:text ? JSON.parse(text) : null};
  };
  const login = async email => {
    const result = await call('/api/admin/login',{email,password:TEST_PASSWORD});
    assert.equal(result.status,200);
    const cookie = result.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
    return {cookie,'x-csrf-token':decodeURIComponent(cookie.match(/mk_csrf=([^;]+)/)[1])};
  };
  try {
    const owner = await login('owner@example.test'), staff = await login('mollevangen@example.test');
    assert.equal((await call(`/api/products/${CUSTOM_BREAD}`,{variantPrices:{st:5200}},staff,'PATCH')).status,403);
    assert.equal((await call(`/api/products/${CUSTOM_BREAD}`,{variantPrices:{st:5200}},owner,'PATCH')).status,200);
    assert.equal((await call(`/api/products/${PRODUCT}`,{hidden:true},owner,'PATCH')).status,200);
    for (const path of ['/api/products',`/api/products/${PRODUCT}`]) {
      const privateResult = await call(path,undefined,owner);
      assert.equal(privateResult.status,200);
      assert.match(privateResult.headers.get('cache-control'),/private.*no-store/);
      assert.match(privateResult.headers.get('vary'),/Cookie/);
      assert.match(privateResult.headers.get('vary'),/Authorization/);
    }
    const publicCatalog = await call('/api/products');
    assert(!publicCatalog.data.some(product=>product.id===PRODUCT));
    assert.equal((await call(`/api/products/${PRODUCT}`)).status,404);
    const body = {items:[{productId:`${CUSTOM_BREAD}-st`,variantId:'st',quantity:4,price:1,productName:'FORGED'}],
      orderType:'takeaway',locationId:HOJA,paymentMethod:'card',scheduledTime:new Date(Date.now()+86400000).toISOString().slice(0,10)+'T14:00',
      customerInfo:{name:'Synthetic Buyer',phone:'0700000021',email:'catalog@example.test'}};
    let n = 0;
    const create = (overrides={}) => call('/api/orders',{...body,...overrides,customerInfo:{...body.customerInfo,phone:'07000000'+String(++n).padStart(2,'0')}},{...checkoutContractHeader,'Idempotency-Key':randomUUID()});
    const purchase = await create();
    assert.equal(purchase.status,201,JSON.stringify(purchase.data));
    assert.equal(await db.sql(`SELECT total_ore FROM orders WHERE id=${literal(purchase.data.id)}`),'20800');
    assert.equal(await db.sql(`SELECT product_name_snapshot FROM order_items WHERE order_id=${literal(purchase.data.id)}`),'Syntetiskt bröd - 4 st');
    const cached = await create({items:[{productId:CUSTOM_BREAD,variantId:'3 st',quantity:4}]});
    assert.equal(cached.status,201);
    assert.equal(cached.data.totalPrice,20800);
    await db.sql(`UPDATE products SET variant_prices='{"st":5200,"3 st":12000}' WHERE id='${CUSTOM_BREAD}'`);
    const bundle = await create({items:[{productId:CUSTOM_BREAD,variantId:'3 st',quantity:1}]});
    assert.equal(bundle.status,201);
    assert.equal(bundle.data.totalPrice,12000,'A real bundle label must retain its own price');
    await db.sql(`UPDATE products SET variant_prices='{"st":5200}' WHERE id='${CUSTOM_BREAD}'`);
    assert.equal((await create({items:[{productId:CUSTOM_BREAD,variantId:'invented',quantity:4}]})).status,400);
    assert.equal((await create({locationId:undefined})).status,400,'Old tokenless/locationless checkout must fail closed');
    const beforeStale = await db.sql('SELECT count(*) FROM orders');
    const stale = await call('/api/orders',body,{'Idempotency-Key':randomUUID()});
    assert.equal(stale.status,426,'A stale client must stop at the contract boundary');
    assert.equal(stale.data.code,'CLIENT_UPGRADE_REQUIRED');
    assert.equal(await db.sql('SELECT count(*) FROM orders'),beforeStale);
    assert.equal((await call('/api/orders',body,checkoutContractHeader)).status,400,'The current contract still requires an idempotency key');
    const delivery = await create({orderType:'delivery',locationId:MOLLEVANGEN,deliveryFee:1,scheduledTime:body.scheduledTime,
      deliveryInfo:{address:'Syntetisk gata 1',postalCode:'12345',city:'Teststad'}});
    assert.equal(delivery.status,201,JSON.stringify(delivery.data));
    assert.equal(delivery.data.locationId,null);
    assert.equal(await db.sql(`SELECT total_ore FROM orders WHERE id=${literal(delivery.data.id)}`),'28700');
    assert.equal(await db.sql(`SELECT location_id IS NULL AND scheduled_at IS NULL FROM orders WHERE id=${literal(delivery.data.id)}`),'t');
    const status = await call(`/api/orders/${delivery.data.id}`,undefined,{'x-order-status-token':delivery.data.statusToken});
    assert.equal(status.data.orderType,'delivery');
    assert(!JSON.stringify(status.data).includes('Syntetisk gata'));
    assert.equal((await call(`/api/orders/${delivery.data.id}`,undefined,{'x-order-status-token':purchase.data.statusToken})).status,401);
    await db.sql(`UPDATE product_location_stock SET in_stock=false WHERE product_id='${CUSTOM_BREAD}' AND location_id='${HOJA}'`);
    assert.equal((await create({orderType:'delivery',deliveryInfo:{address:'Test',postalCode:'12345',city:'Test'}})).status,403);

    const upload = async (bytes,type,headers) => {
      const form = new FormData(); form.set('kind','hero-desktop'); form.set('file',new Blob([bytes],{type}),'test-image.png');
      const response = await nativeFetch(origin+'/api/admin/uploads',{method:'POST',headers,body:form});
      await response.text(); return response.status;
    };
    assert.equal(await upload('<svg onload="alert(1)"/>','image/svg+xml',{}),401);
    assert.equal(await upload('<svg/>','image/svg+xml',staff),403);
    assert.equal(await upload('<svg/>','image/svg+xml',{cookie:owner.cookie}),403);
    assert.equal(await upload('<svg onload="alert(1)"/>','image/png',owner),400,'A claimed raster MIME must not admit active SVG');
    assert.equal(await upload(new Uint8Array(4*1024*1024+1),'image/png',owner),400);
    await verifyLargeStatistics({db,call,owner,staff});
    await db.sql(`CREATE FUNCTION test_catalog_failure() RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN RAISE EXCEPTION 'sensitive synthetic detail'; END; $body$;
      CREATE TRIGGER test_catalog_failure BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION test_catalog_failure()`);
    const failed = await call(`/api/products/${CUSTOM_BREAD}`,{price:10},owner,'PATCH');
    assert.equal(failed.status,500);
    assert.deepEqual(failed.data,{error:'Failed to update product'});
    console.log('Verified catalog authority/cache, custom piece prices, delivery fee/stock/privacy, fail-closed legacy clients and upload authorization/type/size.');
  } finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
});
