import assert from 'node:assert/strict';
import { PRODUCT, TEST_PASSWORD } from './synthetic-api.mjs';

export async function verifyLargeStatistics({db,call,owner,staff}) {
  // The live allocator intentionally replaces supplied numeric display numbers.
  // A nonnumeric fixture namespace keeps the bulk rows addressable without
  // disabling the same trigger used in production.
  await db.sql(`INSERT INTO orders(id,order_number,status,payment_status,total_ore,customer_phone)
    SELECT gen_random_uuid(),'STATS-'||n,'klar','paid',200,'0700000099' FROM generate_series(1,1007) n;
    INSERT INTO order_items(id,order_id,product_id,product_name_snapshot,quantity,price_ore)
    SELECT gen_random_uuid(),o.id,'${PRODUCT}','Syntetisk baklawa',1,100 FROM orders o CROSS JOIN generate_series(1,2)
    WHERE o.order_number LIKE 'STATS-%';`);
  assert.equal((await call('/api/admin/statistics',{password:TEST_PASSWORD},staff)).status,403);
  assert.equal((await call('/api/admin/statistics',{password:'incorrect'},owner)).status,401);
  const result=await call('/api/admin/statistics',{password:TEST_PASSWORD},owner);
  assert.equal(result.status,200,JSON.stringify(result.data));
  assert.equal(result.data.totals.ordersTotal,1007);
  assert.equal(result.data.totals.itemsTotal,2014);
  assert.equal(result.data.totals.revenueTotalOre,201400);
  assert.equal(result.data.products.find(product=>product.name==='Syntetisk baklawa').soldTotal,2014);
  // A later-page database failure must not produce plausible partial totals.
  const originalFetch=globalThis.fetch;
  try {
    globalThis.fetch=async(input,init)=>{
      const request=new Request(input,init),url=new URL(request.url);
      if(url.pathname.endsWith('/orders') && url.searchParams.get('id')?.startsWith('gt.')) {
        return Response.json({code:'SYNTHETIC_PAGE_FAILURE',message:'private details'},{status:500});
      }
      return originalFetch(input,init);
    };
    const failed=await call('/api/admin/statistics',{password:TEST_PASSWORD},owner);
    assert.deepEqual({status:failed.status,data:failed.data},{status:500,data:{error:'Failed to fetch statistics'}});
  } finally { globalThis.fetch=originalFetch; }
  console.log('Verified complete statistics for 1007 paid orders / 2014 lines and fail-closed later-page errors.');
}
