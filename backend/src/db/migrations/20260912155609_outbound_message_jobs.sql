-- Durable customer email/SMS outbox. This is additive: legacy transition RPCs
-- stay available until older backend instances have drained.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.outbound_message_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  event_key text NOT NULL,
  channel text NOT NULL,
  template_version smallint NOT NULL DEFAULT 1,
  event_at timestamptz NOT NULL,
  message_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempt_count smallint NOT NULL DEFAULT 0,
  max_attempts smallint NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  request_started_at timestamptz,
  provider_message_id text,
  last_error_code text,
  last_http_status integer,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbound_message_jobs_event_ck
    CHECK (event_key IN ('order_confirmation', 'order_accepted')),
  CONSTRAINT outbound_message_jobs_channel_ck CHECK (channel IN ('email', 'sms')),
  CONSTRAINT outbound_message_jobs_event_channel_ck CHECK (
    (event_key = 'order_confirmation' AND channel IN ('email', 'sms'))
    OR (event_key = 'order_accepted' AND channel = 'sms')
  ),
  CONSTRAINT outbound_message_jobs_template_ck CHECK (template_version BETWEEN 1 AND 100),
  CONSTRAINT outbound_message_jobs_data_ck CHECK (jsonb_typeof(message_data) = 'object'),
  CONSTRAINT outbound_message_jobs_status_ck CHECK (
    status IN ('pending', 'processing', 'retryable', 'uncertain', 'succeeded', 'permanent_failed')
  ),
  CONSTRAINT outbound_message_jobs_attempts_ck
    CHECK (max_attempts BETWEEN 1 AND 10 AND attempt_count BETWEEN 0 AND max_attempts),
  CONSTRAINT outbound_message_jobs_lease_ck CHECK (
    (status = 'processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'processing' AND lease_token IS NULL AND lease_expires_at IS NULL)
  ),
  CONSTRAINT outbound_message_jobs_error_ck CHECK (
    last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_]{1,64}$'
  ),
  CONSTRAINT outbound_message_jobs_http_ck CHECK (
    last_http_status IS NULL OR last_http_status BETWEEN 100 AND 599
  ),
  CONSTRAINT outbound_message_jobs_provider_id_ck CHECK (
    provider_message_id IS NULL OR length(provider_message_id) BETWEEN 1 AND 255
  ),
  CONSTRAINT outbound_message_jobs_completion_ck CHECK (
    (status IN ('succeeded', 'permanent_failed') AND completed_at IS NOT NULL)
    OR (status NOT IN ('succeeded', 'permanent_failed') AND completed_at IS NULL)
  ),
  CONSTRAINT outbound_message_jobs_order_event_channel_uq
    UNIQUE (order_id, event_key, channel)
);

COMMENT ON TABLE public.outbound_message_jobs IS
  'Durable customer-message jobs. message_data and errors must not contain customer PII or raw provider responses.';

CREATE INDEX outbound_message_jobs_due_idx
  ON public.outbound_message_jobs(next_attempt_at, created_at)
  WHERE status IN ('pending', 'retryable');
CREATE INDEX outbound_message_jobs_lease_idx
  ON public.outbound_message_jobs(lease_expires_at)
  WHERE status = 'processing';
CREATE INDEX outbound_message_jobs_unresolved_idx
  ON public.outbound_message_jobs(status, updated_at DESC)
  WHERE status IN ('retryable', 'uncertain', 'permanent_failed');
CREATE INDEX outbound_message_jobs_order_idx
  ON public.outbound_message_jobs(order_id, created_at);

ALTER TABLE public.outbound_message_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_message_jobs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.outbound_message_jobs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.outbound_message_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.mark_order_paid_with_audit_and_messages(
  p_order_id uuid,
  p_paid_at timestamptz,
  p_event_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF p_paid_at IS NULL OR p_event_id IS NULL THEN
    RAISE EXCEPTION 'payment timestamp and event id are required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders
  SET
    payment_status = 'paid',
    updated_at = p_paid_at,
    receipt_vat_rate_percent = CASE WHEN order_type = 'eat-here' THEN 12 ELSE 6 END,
    receipt_vat_ore = round(
      (total_ore::numeric * CASE WHEN order_type = 'eat-here' THEN 12 ELSE 6 END)
      / (100 + CASE WHEN order_type = 'eat-here' THEN 12 ELSE 6 END)
    )::bigint
  WHERE id = p_order_id AND payment_status = 'pending'
  RETURNING * INTO v_order;

  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO public.security_audit_log (
    event_id, action, resource_type, resource_id, outcome
  ) VALUES (
    p_event_id,
    CASE v_order.payment_method
      WHEN 'card' THEN 'stripe_payment_confirmed'
      WHEN 'swish' THEN 'swish_payment_confirmed'
      ELSE 'online_payment_confirmed'
    END,
    'order', p_order_id::text, 'succeeded'
  );

  -- A late payment for a cancelled order remains recorded, but must not promise
  -- fulfillment to the customer.
  IF v_order.status <> 'avbruten' THEN
    IF NULLIF(btrim(v_order.customer_email), '') IS NOT NULL THEN
      INSERT INTO public.outbound_message_jobs (
        order_id, event_key, channel, event_at
      ) VALUES (
        p_order_id, 'order_confirmation', 'email', p_paid_at
      ) ON CONFLICT (order_id, event_key, channel) DO NOTHING;
    END IF;

    IF v_order.order_type <> 'delivery'
      AND NULLIF(btrim(v_order.customer_phone), '') IS NOT NULL THEN
      INSERT INTO public.outbound_message_jobs (
        order_id, event_key, channel, event_at
      ) VALUES (
        p_order_id, 'order_confirmation', 'sms', p_paid_at
      ) ON CONFLICT (order_id, event_key, channel) DO NOTHING;
    END IF;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_order_with_messages(
  p_order_id uuid,
  p_estimated_ready_at timestamptz,
  p_accepted_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF p_accepted_at IS NULL THEN
    RAISE EXCEPTION 'acceptance timestamp is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders
  SET status = 'mottagen',
    estimated_ready_at = COALESCE(p_estimated_ready_at, estimated_ready_at),
    updated_at = p_accepted_at
  WHERE id = p_order_id
    AND status = 'ny'
    AND (payment_method NOT IN ('card', 'app', 'swish') OR payment_status = 'paid')
  RETURNING * INTO v_order;

  IF NOT FOUND THEN RETURN false; END IF;
  IF v_order.estimated_ready_at IS NULL THEN
    RAISE EXCEPTION 'accepted order is missing ready timestamp' USING ERRCODE = '23514';
  END IF;

  IF v_order.order_type <> 'delivery'
    AND NULLIF(btrim(v_order.customer_phone), '') IS NOT NULL THEN
    INSERT INTO public.outbound_message_jobs (
      order_id, event_key, channel, event_at, message_data
    ) VALUES (
      p_order_id,
      'order_accepted',
      'sms',
      p_accepted_at,
      jsonb_build_object('estimated_ready_at', v_order.estimated_ready_at)
    ) ON CONFLICT (order_id, event_key, channel) DO NOTHING;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_outbound_message_jobs(
  p_limit integer DEFAULT 20,
  p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE (
  job_id uuid,
  order_id uuid,
  event_key text,
  channel text,
  template_version smallint,
  event_at timestamptz,
  message_data jsonb,
  attempt_count smallint,
  max_attempts smallint,
  claim_token uuid
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 30 AND 900 THEN
    RAISE EXCEPTION 'invalid outbound-message claim bounds' USING ERRCODE = '22023';
  END IF;

  -- A crashed worker is safe to retry only when it never marked the provider
  -- request as started. Otherwise delivery is uncertain and must be reconciled.
  UPDATE public.outbound_message_jobs
  SET
    status = CASE WHEN request_started_at IS NULL THEN 'retryable' ELSE 'uncertain' END,
    next_attempt_at = CASE WHEN request_started_at IS NULL THEN now() ELSE next_attempt_at END,
    last_error_code = CASE
      WHEN request_started_at IS NULL THEN 'worker_lease_expired_before_send'
      ELSE 'provider_response_uncertain'
    END,
    lease_token = NULL,
    lease_expires_at = NULL,
    updated_at = now()
  WHERE status = 'processing' AND lease_expires_at < now();

  RETURN QUERY
  WITH candidates AS (
    SELECT jobs.id
    FROM public.outbound_message_jobs AS jobs
    WHERE jobs.status IN ('pending', 'retryable')
      AND jobs.next_attempt_at <= now()
      AND jobs.attempt_count < jobs.max_attempts
    ORDER BY jobs.next_attempt_at, jobs.created_at, jobs.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ), claimed AS (
    UPDATE public.outbound_message_jobs AS jobs
    SET status = 'processing',
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      request_started_at = NULL,
      updated_at = now()
    FROM candidates
    WHERE jobs.id = candidates.id
    RETURNING jobs.*
  )
  SELECT claimed.id, claimed.order_id, claimed.event_key, claimed.channel,
    claimed.template_version, claimed.event_at, claimed.message_data,
    claimed.attempt_count, claimed.max_attempts, claimed.lease_token
  FROM claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_outbound_message_attempt(
  p_job_id uuid,
  p_claim_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.outbound_message_jobs
  SET attempt_count = attempt_count + 1, request_started_at = now(), updated_at = now()
  WHERE id = p_job_id
    AND status = 'processing'
    AND lease_token = p_claim_token
    AND lease_expires_at >= now()
    AND request_started_at IS NULL
    AND attempt_count < max_attempts;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_outbound_message_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_provider_message_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_provider_message_id IS NOT NULL
    AND length(btrim(p_provider_message_id)) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'invalid provider message id' USING ERRCODE = '22023';
  END IF;
  UPDATE public.outbound_message_jobs
  SET status = 'succeeded',
    provider_message_id = NULLIF(btrim(p_provider_message_id), ''),
    last_error_code = NULL,
    last_http_status = NULL,
    completed_at = now(),
    lease_token = NULL,
    lease_expires_at = NULL,
    updated_at = now()
  WHERE id = p_job_id AND status = 'processing'
    AND lease_token = p_claim_token AND request_started_at IS NOT NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_outbound_message_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_http_status integer DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE v_status text;
BEGIN
  IF p_error_code IS NULL OR p_error_code !~ '^[a-z0-9_]{1,64}$'
    OR (p_http_status IS NOT NULL AND p_http_status NOT BETWEEN 100 AND 599) THEN
    RAISE EXCEPTION 'invalid outbound-message failure metadata' USING ERRCODE = '22023';
  END IF;
  UPDATE public.outbound_message_jobs
  SET status = CASE WHEN attempt_count >= max_attempts THEN 'permanent_failed' ELSE 'retryable' END,
    next_attempt_at = CASE attempt_count
      WHEN 1 THEN now() + interval '1 minute'
      WHEN 2 THEN now() + interval '5 minutes'
      WHEN 3 THEN now() + interval '15 minutes'
      WHEN 4 THEN now() + interval '1 hour'
      ELSE next_attempt_at
    END,
    last_error_code = p_error_code,
    last_http_status = p_http_status,
    completed_at = CASE WHEN attempt_count >= max_attempts THEN now() ELSE NULL END,
    lease_token = NULL,
    lease_expires_at = NULL,
    updated_at = now()
  WHERE id = p_job_id AND status = 'processing'
    AND lease_token = p_claim_token AND request_started_at IS NOT NULL
  RETURNING status INTO v_status;
  RETURN v_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_outbound_message_job_uncertain(
  p_job_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_http_status integer DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_error_code IS NULL OR p_error_code !~ '^[a-z0-9_]{1,64}$'
    OR (p_http_status IS NOT NULL AND p_http_status NOT BETWEEN 100 AND 599) THEN
    RAISE EXCEPTION 'invalid outbound-message failure metadata' USING ERRCODE = '22023';
  END IF;
  UPDATE public.outbound_message_jobs
  SET status = 'uncertain', last_error_code = p_error_code,
    last_http_status = p_http_status, lease_token = NULL,
    lease_expires_at = NULL, updated_at = now()
  WHERE id = p_job_id AND status = 'processing'
    AND lease_token = p_claim_token AND request_started_at IS NOT NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_outbound_message_job_permanently(
  p_job_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_http_status integer DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_error_code IS NULL OR p_error_code !~ '^[a-z0-9_]{1,64}$'
    OR (p_http_status IS NOT NULL AND p_http_status NOT BETWEEN 100 AND 599) THEN
    RAISE EXCEPTION 'invalid outbound-message failure metadata' USING ERRCODE = '22023';
  END IF;
  UPDATE public.outbound_message_jobs
  SET status = 'permanent_failed', last_error_code = p_error_code,
    last_http_status = p_http_status, completed_at = now(),
    lease_token = NULL, lease_expires_at = NULL, updated_at = now()
  WHERE id = p_job_id AND status = 'processing' AND lease_token = p_claim_token;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_order_paid_with_audit_and_messages(uuid, timestamptz, uuid),
  public.accept_order_with_messages(uuid, timestamptz, timestamptz),
  public.claim_outbound_message_jobs(integer, integer),
  public.start_outbound_message_attempt(uuid, uuid),
  public.complete_outbound_message_job(uuid, uuid, text),
  public.retry_outbound_message_job(uuid, uuid, text, integer),
  public.mark_outbound_message_job_uncertain(uuid, uuid, text, integer),
  public.fail_outbound_message_job_permanently(uuid, uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_paid_with_audit_and_messages(uuid, timestamptz, uuid),
  public.accept_order_with_messages(uuid, timestamptz, timestamptz),
  public.claim_outbound_message_jobs(integer, integer),
  public.start_outbound_message_attempt(uuid, uuid),
  public.complete_outbound_message_job(uuid, uuid, text),
  public.retry_outbound_message_job(uuid, uuid, text, integer),
  public.mark_outbound_message_job_uncertain(uuid, uuid, text, integer),
  public.fail_outbound_message_job_permanently(uuid, uuid, text, integer)
  TO service_role;

COMMIT;
