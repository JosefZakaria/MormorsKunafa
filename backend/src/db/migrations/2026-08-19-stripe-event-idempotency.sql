-- Persistent Stripe webhook idempotency with a bounded processing lease.
-- Apply manually before deploying the matching backend.

BEGIN;

CREATE TABLE IF NOT EXISTS public.payment_provider_events (
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  livemode boolean NOT NULL,
  status text NOT NULL,
  outcome text,
  order_id text,
  attempts integer NOT NULL DEFAULT 1,
  received_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz,
  processed_at timestamptz,
  PRIMARY KEY (provider, event_id),
  CONSTRAINT payment_provider_events_provider_ck CHECK (provider IN ('stripe', 'swish')),
  CONSTRAINT payment_provider_events_status_ck
    CHECK (status IN ('processing', 'processed', 'failed')),
  CONSTRAINT payment_provider_events_attempts_ck CHECK (attempts BETWEEN 1 AND 100)
);

CREATE INDEX IF NOT EXISTS payment_provider_events_received_idx
  ON public.payment_provider_events(received_at);

CREATE INDEX IF NOT EXISTS payment_provider_events_failed_idx
  ON public.payment_provider_events(provider, status, received_at)
  WHERE status = 'failed';

CREATE OR REPLACE FUNCTION public.claim_stripe_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row_count integer := 0;
BEGIN
  IF p_event_id !~ '^evt_[A-Za-z0-9_]{8,255}$' OR length(p_event_type) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'invalid Stripe event metadata' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.payment_provider_events (
    provider, event_id, event_type, livemode, status, lease_expires_at
  ) VALUES (
    'stripe', p_event_id, p_event_type, p_livemode, 'processing', now() + interval '5 minutes'
  )
  ON CONFLICT (provider, event_id) DO UPDATE
  SET
    status = 'processing',
    attempts = public.payment_provider_events.attempts + 1,
    lease_expires_at = now() + interval '5 minutes',
    outcome = NULL
  WHERE
    public.payment_provider_events.status = 'failed'
    OR (
      public.payment_provider_events.status = 'processing'
      AND public.payment_provider_events.lease_expires_at < now()
    );

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_stripe_event(
  p_event_id text,
  p_order_id text,
  p_outcome text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.payment_provider_events
  SET
    status = 'processed',
    outcome = left(p_outcome, 64),
    order_id = NULLIF(p_order_id, ''),
    processed_at = now(),
    lease_expires_at = NULL
  WHERE provider = 'stripe' AND event_id = p_event_id AND status = 'processing';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stripe event is not held by this worker' USING ERRCODE = '40001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_stripe_event(p_event_id text)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  UPDATE public.payment_provider_events
  SET status = 'failed', lease_expires_at = NULL
  WHERE provider = 'stripe' AND event_id = p_event_id AND status = 'processing';
$$;

REVOKE ALL ON TABLE public.payment_provider_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.payment_provider_events TO service_role;

REVOKE ALL ON FUNCTION public.claim_stripe_event(text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_stripe_event(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_stripe_event(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_stripe_event(text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_stripe_event(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_stripe_event(text) TO service_role;

COMMIT;
