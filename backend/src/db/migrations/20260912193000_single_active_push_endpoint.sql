-- A browser PushSubscription endpoint may be active for exactly one admin.
-- Existing ambiguous bindings are disabled instead of guessing an owner.
BEGIN;
SET LOCAL lock_timeout = '5s';

WITH conflicted_endpoints AS (
  SELECT endpoint
  FROM public.admin_push_subscriptions
  WHERE disabled_at IS NULL
  GROUP BY endpoint
  HAVING count(*) > 1
)
UPDATE public.admin_push_subscriptions AS subscriptions
SET disabled_at = now(), updated_at = now()
FROM conflicted_endpoints
WHERE subscriptions.endpoint = conflicted_endpoints.endpoint
  AND subscriptions.disabled_at IS NULL;

CREATE UNIQUE INDEX admin_push_subscriptions_active_endpoint_uq
  ON public.admin_push_subscriptions(endpoint)
  WHERE disabled_at IS NULL;

DROP FUNCTION IF EXISTS public.register_admin_push_subscription(
  text, text, text, text, text, text
);

CREATE OR REPLACE FUNCTION public.register_admin_push_subscription(
  p_admin_id text,
  p_admin_token_version bigint,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text DEFAULT NULL,
  p_device_label text DEFAULT NULL
)
RETURNS SETOF public.admin_push_subscriptions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_subscription_id uuid;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF NULLIF(btrim(p_admin_id), '') IS NULL
    OR p_admin_token_version IS NULL
    OR p_admin_token_version < 1
    OR NULLIF(btrim(p_endpoint), '') IS NULL
    OR NULLIF(btrim(p_p256dh), '') IS NULL
    OR NULLIF(btrim(p_auth), '') IS NULL
    OR length(p_endpoint) > 2048
    OR length(COALESCE(p_user_agent, '')) > 512
    OR length(COALESCE(p_device_label, '')) > 100 THEN
    RAISE EXCEPTION 'invalid push subscription registration' USING ERRCODE = '22023';
  END IF;

  -- Serialize against logout and reject a request whose authenticated session
  -- was revoked after the HTTP authentication check completed.
  PERFORM 1
  FROM public.admin_users
  WHERE id = p_admin_id
    AND is_active = true
    AND token_version = p_admin_token_version
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'stale admin session' USING ERRCODE = '42501';
  END IF;

  -- New callers for the same endpoint serialize here. The partial unique index
  -- remains the fail-closed guard for a concurrently running older backend.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_endpoint, 0));

  SELECT id INTO v_subscription_id
  FROM public.admin_push_subscriptions
  WHERE admin_id = p_admin_id AND endpoint = p_endpoint
  FOR UPDATE;

  UPDATE public.admin_push_subscriptions
  SET disabled_at = v_now, updated_at = v_now
  WHERE endpoint = p_endpoint AND disabled_at IS NULL;

  IF v_subscription_id IS NULL THEN
    INSERT INTO public.admin_push_subscriptions (
      id, admin_id, endpoint, p256dh, auth, user_agent, device_label,
      created_at, updated_at, disabled_at, last_failure_at, last_failure_reason
    ) VALUES (
      gen_random_uuid(), p_admin_id, p_endpoint, p_p256dh, p_auth,
      NULLIF(btrim(p_user_agent), ''), NULLIF(btrim(p_device_label), ''),
      v_now, v_now, NULL, NULL, NULL
    )
    RETURNING id INTO v_subscription_id;
  ELSE
    UPDATE public.admin_push_subscriptions
    SET p256dh = p_p256dh,
      auth = p_auth,
      user_agent = NULLIF(btrim(p_user_agent), ''),
      device_label = NULLIF(btrim(p_device_label), ''),
      updated_at = v_now,
      disabled_at = NULL,
      last_failure_at = NULL,
      last_failure_reason = NULL
    WHERE id = v_subscription_id;
  END IF;

  RETURN QUERY
  SELECT subscriptions.*
  FROM public.admin_push_subscriptions AS subscriptions
  WHERE subscriptions.id = v_subscription_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_admin_push_subscription(
  text, bigint, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_admin_push_subscription(
  text, bigint, text, text, text, text, text
) TO service_role;

COMMIT;
