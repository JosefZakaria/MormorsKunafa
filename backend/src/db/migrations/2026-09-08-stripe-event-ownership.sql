-- Complement the deployed event ledger without losing pending/processed events.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.payment_provider_events ADD COLUMN IF NOT EXISTS claim_token uuid;

CREATE OR REPLACE FUNCTION public.claim_stripe_event_v2(p_event_id text, p_event_type text, p_livemode boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_row public.payment_provider_events; v_token uuid := gen_random_uuid();
BEGIN
  IF p_event_id IS NULL OR p_event_id !~ '^evt_[A-Za-z0-9_]{8,255}$'
    OR p_event_type IS NULL OR length(p_event_type) NOT BETWEEN 1 AND 255 OR p_livemode IS NULL THEN
    RAISE EXCEPTION 'invalid Stripe event metadata' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.payment_provider_events(provider,event_id,event_type,livemode,status,lease_expires_at,claim_token)
    VALUES ('stripe',p_event_id,p_event_type,p_livemode,'processing',now()+interval '5 minutes',v_token)
    ON CONFLICT DO NOTHING RETURNING * INTO v_row;
  IF FOUND THEN RETURN jsonb_build_object('status','claimed','token',v_token); END IF;
  SELECT * INTO STRICT v_row FROM public.payment_provider_events
    WHERE provider='stripe' AND event_id=p_event_id FOR UPDATE;
  IF v_row.event_type IS DISTINCT FROM p_event_type OR v_row.livemode IS DISTINCT FROM p_livemode THEN
    RAISE EXCEPTION 'Stripe event metadata mismatch' USING ERRCODE = '22023';
  END IF;
  IF v_row.status='processed' THEN RETURN jsonb_build_object('status','processed'); END IF;
  IF v_row.status='processing' AND v_row.lease_expires_at >= now() THEN
    RETURN jsonb_build_object('status','busy');
  END IF;
  UPDATE public.payment_provider_events SET status='processing',claim_token=v_token,
    lease_expires_at=now()+interval '5 minutes',outcome=NULL,attempts=least(attempts+1,100)
    WHERE provider='stripe' AND event_id=p_event_id;
  RETURN jsonb_build_object('status','claimed','token',v_token);
END; $$;

CREATE OR REPLACE FUNCTION public.complete_stripe_event_v2(p_event_id text, p_claim_token uuid, p_order_id text, p_outcome text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.payment_provider_events SET status='processed',outcome=left(p_outcome,64),
    order_id=NULLIF(p_order_id,''),processed_at=now(),lease_expires_at=NULL
    WHERE provider='stripe' AND event_id=p_event_id AND status='processing' AND claim_token=p_claim_token;
  RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION public.fail_stripe_event_v2(p_event_id text, p_claim_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.payment_provider_events SET status='failed',lease_expires_at=NULL
    WHERE provider='stripe' AND event_id=p_event_id AND status='processing' AND claim_token=p_claim_token;
  RETURN FOUND;
END; $$;

-- Older backends can finish a first attempt during rollout. They cannot reclaim
-- existing work: their protocol has no way to identify a stale worker safely.
CREATE OR REPLACE FUNCTION public.claim_stripe_event(p_event_id text,p_event_type text,p_livemode boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_row public.payment_provider_events;
BEGIN
  IF p_event_id IS NULL OR p_event_id !~ '^evt_[A-Za-z0-9_]{8,255}$'
    OR p_event_type IS NULL OR length(p_event_type) NOT BETWEEN 1 AND 255 OR p_livemode IS NULL THEN
    RAISE EXCEPTION 'invalid Stripe event metadata' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.payment_provider_events(provider,event_id,event_type,livemode,status,lease_expires_at)
    VALUES ('stripe',p_event_id,p_event_type,p_livemode,'processing',now()+interval '5 minutes')
    ON CONFLICT DO NOTHING;
  IF FOUND THEN RETURN true; END IF;
  SELECT * INTO STRICT v_row FROM public.payment_provider_events
    WHERE provider='stripe' AND event_id=p_event_id FOR UPDATE;
  IF v_row.status='processed' AND v_row.event_type=p_event_type AND v_row.livemode=p_livemode THEN RETURN false; END IF;
  RAISE EXCEPTION 'Stripe event requires a retry with the current worker' USING ERRCODE = '40001';
END; $$;

CREATE OR REPLACE FUNCTION public.complete_stripe_event(p_event_id text,p_order_id text,p_outcome text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.payment_provider_events SET status='processed',outcome=left(p_outcome,64),
    order_id=NULLIF(p_order_id,''),processed_at=now(),lease_expires_at=NULL
    WHERE provider='stripe' AND event_id=p_event_id AND status='processing' AND claim_token IS NULL AND attempts=1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stripe event ownership lost' USING ERRCODE = '40001'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.fail_stripe_event(p_event_id text)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_temp AS $$
  UPDATE public.payment_provider_events SET status='failed',lease_expires_at=NULL
    WHERE provider='stripe' AND event_id=p_event_id AND status='processing' AND claim_token IS NULL AND attempts=1;
$$;
REVOKE ALL ON FUNCTION public.claim_stripe_event_v2(text,text,boolean),
  public.complete_stripe_event_v2(text,uuid,text,text), public.fail_stripe_event_v2(text,uuid),
  public.claim_stripe_event(text,text,boolean), public.complete_stripe_event(text,text,text), public.fail_stripe_event(text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_event_v2(text,text,boolean),
  public.complete_stripe_event_v2(text,uuid,text,text), public.fail_stripe_event_v2(text,uuid),
  public.claim_stripe_event(text,text,boolean), public.complete_stripe_event(text,text,text), public.fail_stripe_event(text)
  TO service_role;
COMMIT;
