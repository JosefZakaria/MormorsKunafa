-- Apply before deploying the backend that uses these counters.
CREATE TABLE public.api_rate_limits (
  bucket_key text PRIMARY KEY,
  request_count integer NOT NULL CHECK (request_count >= 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX api_rate_limits_expiry_idx ON public.api_rate_limits (expires_at);
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_rate_limits TO service_role;

-- Row locks make counters shared and atomic across server instances.
CREATE FUNCTION public.consume_api_rate_limits(p_rules jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  rule jsonb;
  quota integer;
  window_seconds integer;
  hits integer;
  resets_at timestamptz;
  observed_at timestamptz := clock_timestamp();
  retry_after integer := 0;
BEGIN
  IF p_rules IS NULL OR jsonb_typeof(p_rules) <> 'array'
    OR jsonb_array_length(p_rules) NOT BETWEEN 1 AND 8 THEN
    RAISE EXCEPTION 'Invalid rate-limit rules';
  END IF;
  IF (SELECT count(DISTINCT value->>'key') FROM jsonb_array_elements(p_rules)) <> jsonb_array_length(p_rules) THEN
    RAISE EXCEPTION 'Duplicate rate-limit rules';
  END IF;

  -- Reject exhausted callers before allocating buckets for new email addresses.
  SELECT coalesce(max(ceil(extract(epoch FROM counters.expires_at - observed_at))::integer), 0)
  INTO retry_after FROM public.api_rate_limits AS counters
  JOIN jsonb_array_elements(p_rules) AS requested ON counters.bucket_key = requested.value->>'key'
  WHERE counters.expires_at > observed_at AND counters.request_count >= (requested.value->>'limit')::integer;
  IF retry_after > 0 THEN RETURN retry_after; END IF;

  -- Lock every bucket in order, then reserve all quotas or none. A blocked
  -- recipient must not exhaust the global allowance for other customers.
  FOR rule IN SELECT value FROM jsonb_array_elements(p_rules) ORDER BY value->>'key' LOOP
    quota := (rule->>'limit')::integer;
    window_seconds := (rule->>'windowSeconds')::integer;
    IF coalesce(rule->>'key', '') !~ '^[a-z-]{1,40}:[a-f0-9]{64}$'
      OR quota IS NULL OR quota NOT BETWEEN 1 AND 1000000
      OR window_seconds IS NULL OR window_seconds NOT BETWEEN 1 AND 86400 THEN
      RAISE EXCEPTION 'Invalid rate-limit rule';
    END IF;

    INSERT INTO public.api_rate_limits (bucket_key, request_count, expires_at)
    VALUES (rule->>'key', 0, observed_at + make_interval(secs => window_seconds))
    ON CONFLICT (bucket_key) DO NOTHING;
    SELECT request_count, expires_at INTO hits, resets_at
    FROM public.api_rate_limits WHERE bucket_key = rule->>'key' FOR UPDATE;

    IF resets_at > observed_at AND hits >= quota THEN
      retry_after := greatest(retry_after, ceil(extract(epoch FROM resets_at - observed_at))::integer, 1);
    END IF;
  END LOOP;
  IF retry_after > 0 THEN RETURN retry_after; END IF;

  FOR rule IN SELECT value FROM jsonb_array_elements(p_rules) ORDER BY value->>'key' LOOP
    UPDATE public.api_rate_limits SET
      request_count = CASE WHEN expires_at <= observed_at THEN 1 ELSE request_count + 1 END,
      expires_at = CASE WHEN expires_at <= observed_at
        THEN observed_at + make_interval(secs => (rule->>'windowSeconds')::integer) ELSE expires_at END
    WHERE bucket_key = rule->>'key';
  END LOOP;

  -- Clean bounded batches after reserving quotas; skip buckets locked elsewhere.
  WITH expired AS (
    SELECT bucket_key FROM public.api_rate_limits
    WHERE expires_at < observed_at - interval '1 day'
    ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.api_rate_limits AS counters USING expired
  WHERE counters.bucket_key = expired.bucket_key;
  RETURN 0;
END;
$function$;
REVOKE ALL ON FUNCTION public.consume_api_rate_limits(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limits(jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
