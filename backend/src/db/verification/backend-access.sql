-- Run against Supabase. All test writes are rolled back.
BEGIN;
DO $test$
DECLARE
  t text;
  client_role text;
  stmt text;
  first_column text;
  denied boolean;
  new_order_id text := gen_random_uuid()::text;
  new_item_id text := gen_random_uuid()::text;
BEGIN
  FOREACH t IN ARRAY ARRAY['admin_push_delivery_logs','admin_push_subscriptions','admin_settings','admin_users','locations','order_items','orders','product_location_stock','products'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=format('public.%I',t)::regclass) THEN
      RAISE EXCEPTION 'RLS disabled on %', t;
    END IF;
    SELECT attname INTO first_column FROM pg_attribute
      WHERE attrelid=format('public.%I',t)::regclass AND attnum>0 AND NOT attisdropped
      ORDER BY attnum LIMIT 1;
    FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      FOREACH stmt IN ARRAY ARRAY[
        format('SELECT * FROM public.%I LIMIT 0',t),
        format('INSERT INTO public.%I SELECT * FROM public.%I WHERE false',t,t),
        format('UPDATE public.%I SET %I=%I WHERE false',t,first_column,first_column),
        format('DELETE FROM public.%I WHERE false',t)
      ] LOOP
        denied := false;
        EXECUTE format('SET LOCAL ROLE %I',client_role);
        BEGIN
          EXECUTE stmt;
        EXCEPTION WHEN insufficient_privilege THEN
          denied := true;
        END;
        RESET ROLE;
        IF NOT denied THEN
          RAISE EXCEPTION 'Unexpected access for %: %',client_role,stmt;
        END IF;
      END LOOP;
    END LOOP;
    SET LOCAL ROLE service_role;
    EXECUTE format('SELECT * FROM public.%I LIMIT 0',t);
    RESET ROLE;
  END LOOP;

  SET LOCAL ROLE service_role;
  INSERT INTO public.orders(id,order_number,customer_name,total_ore)
    VALUES(new_order_id,'RLS-' || left(new_order_id,20),'RLS rollback test',100);
  INSERT INTO public.order_items(id,order_id,product_name_snapshot,quantity,price_ore)
    VALUES(new_item_id,new_order_id,'RLS rollback test',1,100);
  IF NOT EXISTS(SELECT 1 FROM public.orders o JOIN public.order_items i ON i.order_id=o.id WHERE o.id=new_order_id) THEN
    RAISE EXCEPTION 'Backend cannot read inserted order and item';
  END IF;
  UPDATE public.orders SET internal_notes='RLS verified' WHERE id=new_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Backend cannot update order'; END IF;
  DELETE FROM public.order_items WHERE id=new_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Backend cannot delete item'; END IF;
  DELETE FROM public.orders WHERE id=new_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Backend cannot delete order'; END IF;
  RESET ROLE;
END
$test$;
ROLLBACK;
SELECT 'PASS: 72 client access denials, 9 backend reads, backend order/item write cycle; rolled back' AS result;

