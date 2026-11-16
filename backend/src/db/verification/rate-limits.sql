-- Run after the api_rate_limits migration in an isolated PostgreSQL database.
-- Synthetic counters only; all test writes are rolled back.
BEGIN;
DO $test$
DECLARE
  result integer;
  key_a text := 'test-a:' || repeat('a', 64);
  key_global text := 'a-global:' || repeat('b', 64);
  key_recipient text := 'z-recipient:' || repeat('c', 64);
  rules jsonb;
  reset_before timestamptz;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.api_rate_limits'::regclass) THEN
    RAISE EXCEPTION 'Rate-limit table must have RLS';
  END IF;
  IF has_table_privilege('anon', 'public.api_rate_limits', 'SELECT')
    OR has_table_privilege('authenticated', 'public.api_rate_limits', 'INSERT')
    OR has_function_privilege('anon', 'public.consume_api_rate_limits(jsonb)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.consume_api_rate_limits(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Client roles must not access counters or consume quotas';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.consume_api_rate_limits(jsonb)', 'EXECUTE')
    OR (SELECT prosecdef FROM pg_proc WHERE oid = 'public.consume_api_rate_limits(jsonb)'::regprocedure) THEN
    RAISE EXCEPTION 'Function must run as the calling service_role, not security definer';
  END IF;

  rules := jsonb_build_array(jsonb_build_object('key', key_a, 'limit', 2, 'windowSeconds', 600));
  IF public.consume_api_rate_limits(rules) <> 0 OR public.consume_api_rate_limits(rules) <> 0 THEN
    RAISE EXCEPTION 'Requests within quota must succeed';
  END IF;
  SELECT expires_at INTO reset_before FROM public.api_rate_limits WHERE bucket_key = key_a;
  result := public.consume_api_rate_limits(rules);
  IF result NOT BETWEEN 1 AND 600
    OR (SELECT request_count FROM public.api_rate_limits WHERE bucket_key = key_a) <> 2
    OR (SELECT expires_at FROM public.api_rate_limits WHERE bucket_key = key_a) <> reset_before THEN
    RAISE EXCEPTION 'Blocked requests must report a wait without extending the window or consuming quota';
  END IF;

  UPDATE public.api_rate_limits SET expires_at = clock_timestamp() - interval '1 second' WHERE bucket_key = key_a;
  result := public.consume_api_rate_limits(rules);
  IF result <> 0
    OR (SELECT request_count FROM public.api_rate_limits WHERE bucket_key = key_a) <> 1 THEN
    RAISE EXCEPTION 'Expired windows must reset';
  END IF;

  PERFORM public.consume_api_rate_limits(jsonb_build_array(jsonb_build_object('key', key_recipient, 'limit', 1, 'windowSeconds', 600)));
  rules := jsonb_build_array(
    jsonb_build_object('key', key_global, 'limit', 10, 'windowSeconds', 600),
    jsonb_build_object('key', key_recipient, 'limit', 1, 'windowSeconds', 600)
  );
  result := public.consume_api_rate_limits(rules);
  IF result = 0
    OR coalesce((SELECT request_count FROM public.api_rate_limits WHERE bucket_key = key_global), 0) <> 0 THEN
    RAISE EXCEPTION 'A blocked recipient must not spend the global quota';
  END IF;
  IF EXISTS (SELECT 1 FROM public.api_rate_limits WHERE bucket_key = key_global) THEN
    RAISE EXCEPTION 'An exhausted caller must not allocate new buckets';
  END IF;

  BEGIN
    PERFORM public.consume_api_rate_limits(jsonb_build_array(
      jsonb_build_object('key', key_a, 'limit', 10, 'windowSeconds', 600),
      jsonb_build_object('key', key_a, 'limit', 10, 'windowSeconds', 600)
    ));
    RAISE EXCEPTION 'Duplicate rules were accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Duplicate rate-limit rules' THEN RAISE; END IF;
  END;

  INSERT INTO public.api_rate_limits VALUES ('expired:' || repeat('d',64), 1, clock_timestamp() - interval '2 days');
  PERFORM public.consume_api_rate_limits(jsonb_build_array(jsonb_build_object('key', key_global, 'limit', 10, 'windowSeconds', 600)));
  IF EXISTS (SELECT 1 FROM public.api_rate_limits WHERE bucket_key = 'expired:' || repeat('d',64)) THEN
    RAISE EXCEPTION 'Old counters must be cleaned up';
  END IF;
END;
$test$;

SET LOCAL ROLE service_role;
SELECT public.consume_api_rate_limits(jsonb_build_array(jsonb_build_object(
  'key', 'service-test:' || repeat('e',64), 'limit', 5, 'windowSeconds', 60
))) AS service_role_allowed;
RESET ROLE;

SET LOCAL ROLE anon;
DO $test$
BEGIN
  BEGIN
    PERFORM public.consume_api_rate_limits('[]'::jsonb);
    RAISE EXCEPTION 'anon executed a service-only function';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.api_rate_limits;
    RAISE EXCEPTION 'anon read private counters';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$test$;
RESET ROLE;
ROLLBACK;
