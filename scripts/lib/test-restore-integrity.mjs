import assert from 'node:assert/strict';
import path from 'node:path';
import { repositoryRoot } from './local-test-database.mjs';

export async function verifyRestoreIntegrityChecks({sql,file}) {
  const verification=path.join(repositoryRoot,'backend/src/db/verification/verify-restored-database.sql');
  await file(verification, {expected_accounting_profile:'legacy-core'}); // An empty but complete schema is valid.
  await assert.rejects(
    file(verification, {expected_accounting_profile:'secured-ledgers'}),
    undefined,
    'A core-only restore must not claim to contain the secured ledgers',
  );
  await sql('CREATE TABLE public.payment_provider_events (id integer)');
  await assert.rejects(
    file(verification, {expected_accounting_profile:'legacy-core'}),
    undefined,
    'A partial secured-ledger set must require investigation',
  );
  await sql('DROP TABLE public.payment_provider_events');
  const id='bc2150c8-8d87-4fb0-b4e5-27fcb1241101', item='bc2150c8-8d87-4fb0-b4e5-27fcb1241102';
  await sql(`ALTER TABLE orders ALTER COLUMN total_ore DROP NOT NULL, ALTER COLUMN order_number DROP NOT NULL;
    ALTER TABLE order_items ALTER COLUMN quantity DROP NOT NULL, ALTER COLUMN price_ore DROP NOT NULL;
    INSERT INTO orders(id,order_number,customer_phone,total_ore) VALUES('${id}','#0001','+46700000000',100);
    INSERT INTO order_items(id,order_id,product_name_snapshot,quantity,price_ore) VALUES('${item}','${id}','Synthetic',1,100)`);
  await file(verification, {expected_accounting_profile:'legacy-core'});
  for (const [mutation,repair] of [
    [`UPDATE orders SET total_ore=0`,`UPDATE orders SET total_ore=100`],
    [`UPDATE orders SET total_ore=NULL`,`UPDATE orders SET total_ore=100`],
    [`UPDATE orders SET order_number=NULL`,`UPDATE orders SET order_number='#0001'`],
    [`UPDATE order_items SET quantity=0`,`UPDATE order_items SET quantity=1`],
    [`UPDATE order_items SET quantity=NULL`,`UPDATE order_items SET quantity=1`],
    [`UPDATE order_items SET price_ore=0`,`UPDATE order_items SET price_ore=100`],
    [`UPDATE order_items SET price_ore=NULL`,`UPDATE order_items SET price_ore=100`],
    [`UPDATE orders SET total_ore=101`,`UPDATE orders SET total_ore=100`],
    [`DELETE FROM order_items`,`INSERT INTO order_items(id,order_id,product_name_snapshot,quantity,price_ore) VALUES('${item}','${id}','Synthetic',1,100)`],
    [`ALTER TABLE order_items DROP CONSTRAINT order_items_order_id_fkey; UPDATE order_items SET order_id='bc2150c8-8d87-4fb0-b4e5-27fcb1241103'`,
      `UPDATE order_items SET order_id='${id}'; ALTER TABLE order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE`],
    [`ALTER TABLE orders DROP CONSTRAINT orders_order_number_key; INSERT INTO orders(id,order_number,customer_phone,total_ore) VALUES('bc2150c8-8d87-4fb0-b4e5-27fcb1241103','#0001','+46700000000',100)`,
      `DELETE FROM orders WHERE id='bc2150c8-8d87-4fb0-b4e5-27fcb1241103'; ALTER TABLE orders ADD CONSTRAINT orders_order_number_key UNIQUE(order_number)`],
  ]) {
    await sql(mutation);
    await assert.rejects(file(verification, {expected_accounting_profile:'legacy-core'}),undefined,mutation);
    await sql(repair);
  }
  await file(verification, {expected_accounting_profile:'legacy-core'});
  await sql(`DELETE FROM orders WHERE id='${id}';
    ALTER TABLE orders ALTER COLUMN total_ore SET NOT NULL, ALTER COLUMN order_number SET NOT NULL;
    ALTER TABLE order_items ALTER COLUMN quantity SET NOT NULL, ALTER COLUMN price_ore SET NOT NULL`);
}
