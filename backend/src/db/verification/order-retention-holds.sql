-- Isolated PostgreSQL test only. Requires the synthetic order seeded by retention-migration.test.ps1.
BEGIN;
DO $test$
DECLARE
  client text;
  hold_id uuid;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.order_retention_holds'::regclass) THEN
    RAISE EXCEPTION 'Holds must have RLS';
  END IF;
  FOREACH client IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_table_privilege(client, 'public.order_retention_holds', 'SELECT')
      OR has_table_privilege(client, 'public.order_retention_holds', 'INSERT')
      OR has_any_column_privilege(client, 'public.order_retention_holds', 'UPDATE')
      OR has_table_privilege(client, 'public.order_retention_holds', 'DELETE') THEN
      RAISE EXCEPTION 'Client role % must not access holds', client;
    END IF;
    EXECUTE format('SET LOCAL ROLE %I', client);
    BEGIN
      PERFORM * FROM public.order_retention_holds;
      RAISE EXCEPTION 'Client read unexpectedly succeeded';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET ROLE;
  END LOOP;
  SET LOCAL ROLE service_role;
  INSERT INTO public.order_retention_holds(order_id, fields, reason, responsible_admin_id, responsible_name, review_on)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ARRAY['contact'], 'complaint', 'test-owner', 'Synthetic owner', '2020-01-01')
    RETURNING id INTO hold_id;
  IF NOT EXISTS (SELECT 1 FROM public.order_retention_holds WHERE id = hold_id AND released_at IS NULL) THEN
    RAISE EXCEPTION 'Overdue hold must still be active';
  END IF;
  BEGIN
    UPDATE public.order_retention_holds SET fields = ARRAY['notes'] WHERE id = hold_id;
    RAISE EXCEPTION 'Service role must not rewrite hold scope';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.order_retention_holds WHERE id = hold_id;
    RAISE EXCEPTION 'Service role must not delete hold documentation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.order_retention_holds(order_id, fields, reason, responsible_admin_id, responsible_name, review_on)
      VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ARRAY['arbitrary'], 'complaint', 'test-owner', 'Synthetic owner', CURRENT_DATE);
    RAISE EXCEPTION 'Unknown field must fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.order_retention_holds SET released_at = now(), released_by = 'test-owner' WHERE id = hold_id;
  IF NOT EXISTS (SELECT 1 FROM public.order_retention_holds WHERE id = hold_id AND released_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Service role must be able to release a hold';
  END IF;
  RESET ROLE;
END;
$test$;
SELECT 'PASS: RLS, client denial, scoped backend grants, constraints and explicit release' AS result;
ROLLBACK;

BEGIN;
DO $test$
DECLARE
  original jsonb;
  expected jsonb;
  outcome jsonb;
  hold_id uuid;
  log_count integer;
BEGIN
  IF has_function_privilege('anon', 'public.apply_order_retention(text,jsonb,text[],text,text,boolean,date,boolean,timestamp with time zone)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.apply_order_retention(text,jsonb,text[],text,text,boolean,date,boolean,timestamp with time zone)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Clients must not execute erasure';
  END IF;
  SELECT to_jsonb(o) INTO original FROM public.orders o WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  INSERT INTO public.order_retention_holds(order_id, fields, reason, responsible_admin_id, responsible_name, review_on)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ARRAY['notes'], 'complaint', 'test-owner', 'Synthetic owner', '2020-01-01') RETURNING id INTO hold_id;
  SET LOCAL ROLE service_role;
  BEGIN
    PERFORM public.apply_order_retention('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', original, ARRAY['contact'], 'closed_order', 'not-owner', true, (CURRENT_DATE - INTERVAL '4 years')::date, false, NULL);
    RAISE EXCEPTION 'Non-owner actor must fail inside the transaction' USING ERRCODE='XX000';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  outcome := public.apply_order_retention('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', original, ARRAY['contact','delivery_contact'], 'closed_order', 'test-owner', true, (CURRENT_DATE - INTERVAL '4 years')::date, false, NULL);
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE customer_email IS NULL AND customer_phone IS NULL
    AND delivery_info_json->>'email' IS NULL AND delivery_info_json->>'phone' IS NULL
    AND customer_name='Synthetic customer' AND delivery_info_json->'pricing'->>'feeOre'='5000'
    AND total_ore=10000 AND payment_status='paid' AND stripe_checkout_session_id='cs_live_test' AND internal_notes='Synthetic work instructions') THEN
    RAISE EXCEPTION 'Only selected contact fields may change';
  END IF;
  IF (SELECT count(*) FROM public.order_retention_runs) <> 1 OR outcome->>'runId' IS NULL THEN RAISE EXCEPTION 'Successful erasure must be logged'; END IF;
  IF EXISTS (SELECT 1 FROM public.order_retention_runs r WHERE to_jsonb(r)::text LIKE '%synthetic@example.invalid%') THEN RAISE EXCEPTION 'Log must not copy removed values'; END IF;
  BEGIN
    PERFORM public.apply_order_retention('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', original, ARRAY['contact'], 'closed_order', 'test-owner', true, (CURRENT_DATE - INTERVAL '4 years')::date, false, NULL);
    RAISE EXCEPTION 'Stale snapshot must fail' USING ERRCODE='XX000';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  SELECT to_jsonb(o) INTO expected FROM public.orders o WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  BEGIN
    PERFORM public.apply_order_retention('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', expected, ARRAY['notes'], 'closed_order', 'test-owner', true, CURRENT_DATE - 100, true, NULL);
    RAISE EXCEPTION 'Overdue note hold must block erasure' USING ERRCODE='XX000';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  BEGIN
    PERFORM public.apply_order_retention('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', expected, ARRAY['purchase_details'], 'closed_order', 'test-owner', true, (CURRENT_DATE - INTERVAL '4 years')::date, true, NULL);
    RAISE EXCEPTION 'Economic fields must never be erased' USING ERRCODE='XX000';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  UPDATE public.order_retention_holds SET released_at=now(), released_by='test-owner' WHERE id=hold_id;
  RESET ROLE;
  REVOKE INSERT ON public.order_retention_runs FROM service_role;
  SET LOCAL ROLE service_role;
  BEGIN
    PERFORM public.apply_order_retention('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', expected, ARRAY['notes'], 'closed_order', 'test-owner', true, CURRENT_DATE - 100, true, NULL);
    RAISE EXCEPTION 'Missing audit write permission must abort erasure' USING ERRCODE='XX000';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE internal_notes='Synthetic work instructions') THEN RAISE EXCEPTION 'Failed logging must roll back erasure'; END IF;
  RESET ROLE;
  GRANT INSERT ON public.order_retention_runs TO service_role;
  SET LOCAL ROLE service_role;
  PERFORM public.apply_order_retention('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', expected, ARRAY['notes'], 'closed_order', 'test-owner', true, CURRENT_DATE - 100, true, NULL);
  IF (SELECT count(*) FROM public.order_retention_runs) <> 2 THEN RAISE EXCEPTION 'Failed attempts must not create success logs'; END IF;
  RESET ROLE;
  INSERT INTO public.orders(id, status, payment_status, created_at) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','ny','pending',now() AT TIME ZONE 'UTC' - INTERVAL '100 days');
  SELECT to_jsonb(o) INTO expected FROM public.orders o WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  SET LOCAL ROLE service_role;
  BEGIN
    PERFORM public.apply_order_retention('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', expected, ARRAY['identity_address'], 'abandoned_30_days', 'test-owner', true, NULL, false, now() - INTERVAL '29 days');
    RAISE EXCEPTION '29 days must not qualify' USING ERRCODE='XX000';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  PERFORM public.apply_order_retention('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', expected, ARRAY['identity_address','contact','delivery_contact'], 'abandoned_30_days', 'test-owner', true, NULL, false, now() - INTERVAL '31 days');
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    AND customer_name IS NULL AND customer_phone IS NULL AND customer_email IS NULL
    AND delivery_info_json->>'address' IS NULL AND delivery_info_json->'pricing'->>'feeOre'='5000'
    AND total_ore=10000 AND payment_status='pending') THEN RAISE EXCEPTION 'Abandoned erasure must preserve financial values and delivery pricing'; END IF;
  RESET ROLE;
  INSERT INTO public.orders(id) VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  SELECT to_jsonb(o) INTO expected FROM public.orders o WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  SET LOCAL ROLE service_role;
  BEGIN
    PERFORM public.apply_order_retention('cccccccc-cccc-4ccc-8ccc-cccccccccccc', expected, ARRAY['contact'], 'closed_order', 'test-owner', true, CURRENT_DATE - 1, false, NULL);
    RAISE EXCEPTION 'Ordinary rule must enforce its date' USING ERRCODE='XX000';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  PERFORM public.apply_order_retention('cccccccc-cccc-4ccc-8ccc-cccccccccccc', expected, ARRAY['contact'], 'purpose_ended', 'test-owner', true, CURRENT_DATE - 1, false, NULL);
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' AND customer_name='Synthetic customer' AND customer_phone IS NULL) THEN
    RAISE EXCEPTION 'Individual purpose-ended erasure must preserve identity';
  END IF;
  RESET ROLE;
END;
$test$;
SELECT 'PASS: real field erasure, holds, immutable finances, stale snapshots, audit and atomic rollback' AS result;
ROLLBACK;
