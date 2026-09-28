-- Separate ledger for refunding a verified second Stripe Checkout Session.
-- This intentionally never changes order_refunds, order_refund_items or the
-- order's ordinary item-refund totals/status.

BEGIN;

CREATE TABLE IF NOT EXISTS public.duplicate_stripe_refunds (
  id uuid PRIMARY KEY,
  stripe_event_id text NOT NULL UNIQUE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  stripe_session_id text NOT NULL UNIQUE,
  payment_intent_id text NOT NULL UNIQUE,
  amount_ore bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  idempotency_key text NOT NULL UNIQUE,
  provider_refund_id text UNIQUE,
  requested_by_admin_id text NOT NULL,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT duplicate_stripe_refunds_event_ck
    CHECK (stripe_event_id ~ '^evt_[A-Za-z0-9_]{8,255}$'),
  CONSTRAINT duplicate_stripe_refunds_session_ck
    CHECK (stripe_session_id ~ '^cs_[A-Za-z0-9_]{8,255}$'),
  CONSTRAINT duplicate_stripe_refunds_intent_ck
    CHECK (payment_intent_id ~ '^pi_[A-Za-z0-9_]{8,255}$'),
  CONSTRAINT duplicate_stripe_refunds_amount_ck CHECK (amount_ore > 0),
  CONSTRAINT duplicate_stripe_refunds_status_ck
    CHECK (status IN ('pending', 'succeeded', 'failed')),
  CONSTRAINT duplicate_stripe_refunds_idempotency_ck
    CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  CONSTRAINT duplicate_stripe_refunds_actor_ck
    CHECK (length(requested_by_admin_id) BETWEEN 1 AND 128),
  CONSTRAINT duplicate_stripe_refunds_failure_ck
    CHECK (failure_code IS NULL OR length(failure_code) <= 100),
  CONSTRAINT duplicate_stripe_refunds_completion_ck CHECK (
    (status = 'pending' AND completed_at IS NULL)
    OR (status IN ('succeeded', 'failed') AND completed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS duplicate_stripe_refunds_order_created_idx
  ON public.duplicate_stripe_refunds(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS duplicate_stripe_refunds_pending_idx
  ON public.duplicate_stripe_refunds(updated_at)
  WHERE status = 'pending';

ALTER TABLE public.duplicate_stripe_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duplicate_stripe_refunds FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.reserve_duplicate_stripe_refund(
  p_refund_id uuid,
  p_stripe_event_id text,
  p_order_id uuid,
  p_stripe_session_id text,
  p_payment_intent_id text,
  p_amount_ore bigint,
  p_admin_id text,
  p_idempotency_key text
)
RETURNS TABLE(refund_id uuid, status text, provider_refund_id text, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event public.payment_provider_events%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_existing public.duplicate_stripe_refunds%ROWTYPE;
BEGIN
  IF p_stripe_event_id !~ '^evt_[A-Za-z0-9_]{8,255}$'
     OR p_stripe_session_id !~ '^cs_[A-Za-z0-9_]{8,255}$'
     OR p_payment_intent_id !~ '^pi_[A-Za-z0-9_]{8,255}$'
     OR p_amount_ore <= 0
     OR length(trim(coalesce(p_admin_id, ''))) NOT BETWEEN 1 AND 128
     OR length(coalesce(p_idempotency_key, '')) NOT BETWEEN 16 AND 128 THEN
    RAISE EXCEPTION 'invalid duplicate refund reservation' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_event
  FROM public.payment_provider_events e
  WHERE e.provider = 'stripe' AND e.event_id = p_stripe_event_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_event.status <> 'processed'
     OR v_event.event_type <> 'checkout.session.completed'
     OR v_event.outcome <> 'alert_paid_session_validation_failed'
     OR v_event.order_id <> p_order_id::text THEN
    RAISE EXCEPTION 'event is not an eligible paid-session alert' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_order FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND
     OR v_order.payment_status <> 'paid'
     OR v_order.payment_method NOT IN ('card', 'app')
     OR nullif(v_order.stripe_checkout_session_id, '') IS NULL
     OR v_order.stripe_checkout_session_id = p_stripe_session_id
     OR v_order.total_ore <> p_amount_ore THEN
    RAISE EXCEPTION 'order is not eligible for a duplicate Stripe refund' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.duplicate_stripe_refunds r
  WHERE r.stripe_event_id = p_stripe_event_id;
  IF FOUND THEN
    IF v_existing.order_id <> p_order_id
       OR v_existing.stripe_session_id <> p_stripe_session_id
       OR v_existing.payment_intent_id <> p_payment_intent_id
       OR v_existing.amount_ore <> p_amount_ore THEN
      RAISE EXCEPTION 'event already reserved with another payment identity' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT v_existing.id, v_existing.status,
      v_existing.provider_refund_id, false;
    RETURN;
  END IF;

  INSERT INTO public.duplicate_stripe_refunds (
    id, stripe_event_id, order_id, stripe_session_id, payment_intent_id,
    amount_ore, idempotency_key, requested_by_admin_id
  ) VALUES (
    p_refund_id, p_stripe_event_id, p_order_id, p_stripe_session_id,
    p_payment_intent_id, p_amount_ore, p_idempotency_key, trim(p_admin_id)
  );

  INSERT INTO public.security_audit_log (
    event_id, actor_admin_id, action, resource_type, resource_id, outcome
  ) VALUES (
    gen_random_uuid(), trim(p_admin_id), 'duplicate_stripe_refund_reserved',
    'stripe_event', p_stripe_event_id, 'attempted'
  );

  RETURN QUERY SELECT p_refund_id, 'pending'::text, NULL::text, true;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_duplicate_stripe_refund_provider_reference(
  p_refund_id uuid,
  p_provider_refund_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_provider_refund_id !~ '^re_[A-Za-z0-9_]{8,255}$' THEN
    RAISE EXCEPTION 'invalid Stripe refund id' USING ERRCODE = '22023';
  END IF;
  UPDATE public.duplicate_stripe_refunds
  SET provider_refund_id = p_provider_refund_id, updated_at = now()
  WHERE id = p_refund_id AND status = 'pending'
    AND (provider_refund_id IS NULL OR provider_refund_id = p_provider_refund_id);
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_duplicate_stripe_refund(
  p_refund_id uuid,
  p_succeeded boolean,
  p_failure_code text,
  p_completed_at timestamptz,
  p_audit_event_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_refund public.duplicate_stripe_refunds%ROWTYPE;
BEGIN
  SELECT * INTO v_refund
  FROM public.duplicate_stripe_refunds r WHERE r.id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'duplicate Stripe refund not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_refund.status <> 'pending' THEN
    IF (v_refund.status = 'succeeded') <> p_succeeded THEN
      RAISE EXCEPTION 'refund already finalized with another outcome' USING ERRCODE = '22023';
    END IF;
    RETURN false;
  END IF;

  UPDATE public.duplicate_stripe_refunds
  SET status = CASE WHEN p_succeeded THEN 'succeeded' ELSE 'failed' END,
      failure_code = CASE WHEN p_succeeded THEN NULL
        ELSE left(coalesce(nullif(p_failure_code, ''), 'provider_failed'), 100) END,
      completed_at = p_completed_at,
      updated_at = p_completed_at
  WHERE id = p_refund_id;

  INSERT INTO public.security_audit_log (
    event_id, actor_admin_id, action, resource_type, resource_id, outcome
  ) VALUES (
    p_audit_event_id,
    v_refund.requested_by_admin_id,
    CASE WHEN p_succeeded THEN 'duplicate_stripe_refund_confirmed'
      ELSE 'duplicate_stripe_refund_failed' END,
    'stripe_event',
    v_refund.stripe_event_id,
    CASE WHEN p_succeeded THEN 'succeeded' ELSE 'failed' END
  );
  RETURN true;
END;
$$;

REVOKE ALL ON TABLE public.duplicate_stripe_refunds FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.duplicate_stripe_refunds FROM service_role;
GRANT SELECT ON TABLE public.duplicate_stripe_refunds TO service_role;

REVOKE ALL ON FUNCTION public.reserve_duplicate_stripe_refund(uuid, text, uuid, text, text, bigint, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_duplicate_stripe_refund_provider_reference(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_duplicate_stripe_refund(uuid, boolean, text, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_duplicate_stripe_refund(uuid, text, uuid, text, text, bigint, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.set_duplicate_stripe_refund_provider_reference(uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_duplicate_stripe_refund(uuid, boolean, text, timestamptz, uuid)
  TO service_role;

COMMIT;
