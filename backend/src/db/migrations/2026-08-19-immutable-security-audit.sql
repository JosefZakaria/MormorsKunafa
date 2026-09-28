-- Append-only audit trail for admin access, authentication attempts and
-- security-relevant payment state changes.
-- Apply manually before deploying the matching backend.

BEGIN;

CREATE TABLE IF NOT EXISTS public.security_audit_log (
  event_id uuid PRIMARY KEY,
  actor_admin_id text,
  subject_hash text,
  action text NOT NULL,
  http_method text,
  route_template text,
  resource_type text,
  resource_id text,
  outcome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_audit_action_ck CHECK (length(action) BETWEEN 1 AND 100),
  CONSTRAINT security_audit_method_ck
    CHECK (http_method IS NULL OR http_method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  CONSTRAINT security_audit_outcome_ck
    CHECK (outcome IN ('attempted', 'succeeded', 'denied', 'failed')),
  CONSTRAINT security_audit_subject_hash_ck
    CHECK (subject_hash IS NULL OR subject_hash ~ '^[A-Za-z0-9_-]{43}$')
);

CREATE INDEX IF NOT EXISTS security_audit_created_idx
  ON public.security_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_actor_idx
  ON public.security_audit_log(actor_admin_id, created_at DESC)
  WHERE actor_admin_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS security_audit_resource_idx
  ON public.security_audit_log(resource_type, resource_id, created_at DESC)
  WHERE resource_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reject_security_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'security_audit_log is append-only' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS security_audit_no_update_delete ON public.security_audit_log;
CREATE TRIGGER security_audit_no_update_delete
BEFORE UPDATE OR DELETE ON public.security_audit_log
FOR EACH ROW EXECUTE FUNCTION public.reject_security_audit_mutation();

DROP TRIGGER IF EXISTS security_audit_no_truncate ON public.security_audit_log;
CREATE TRIGGER security_audit_no_truncate
BEFORE TRUNCATE ON public.security_audit_log
FOR EACH STATEMENT EXECUTE FUNCTION public.reject_security_audit_mutation();

CREATE OR REPLACE FUNCTION public.append_security_audit_event(
  p_event_id uuid,
  p_actor_admin_id text,
  p_subject_hash text,
  p_action text,
  p_http_method text,
  p_route_template text,
  p_resource_type text,
  p_resource_id text,
  p_outcome text
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.security_audit_log (
    event_id, actor_admin_id, subject_hash, action, http_method,
    route_template, resource_type, resource_id, outcome
  ) VALUES (
    p_event_id,
    NULLIF(left(p_actor_admin_id, 128), ''),
    NULLIF(p_subject_hash, ''),
    left(p_action, 100),
    NULLIF(p_http_method, ''),
    NULLIF(left(p_route_template, 255), ''),
    NULLIF(left(p_resource_type, 64), ''),
    NULLIF(left(p_resource_id, 128), ''),
    p_outcome
  );
$$;

CREATE OR REPLACE FUNCTION public.mark_order_paid_with_audit(
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
  v_payment_method text;
BEGIN
  UPDATE public.orders
  SET payment_status = 'paid', updated_at = p_paid_at
  WHERE id = p_order_id
    AND payment_status = 'pending'
  RETURNING payment_method INTO v_payment_method;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.security_audit_log (
    event_id,
    action,
    resource_type,
    resource_id,
    outcome
  ) VALUES (
    p_event_id,
    CASE v_payment_method
      WHEN 'card' THEN 'stripe_payment_confirmed'
      WHEN 'swish' THEN 'swish_payment_confirmed'
      ELSE 'online_payment_confirmed'
    END,
    'order',
    p_order_id::text,
    'succeeded'
  );

  RETURN true;
END;
$$;

REVOKE ALL ON TABLE public.security_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.security_audit_log TO service_role;
REVOKE ALL ON FUNCTION public.append_security_audit_event(
  uuid, text, text, text, text, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_security_audit_event(
  uuid, text, text, text, text, text, text, text, text
) TO service_role;
REVOKE ALL ON FUNCTION public.mark_order_paid_with_audit(uuid, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_paid_with_audit(uuid, timestamptz, uuid)
  TO service_role;

COMMIT;
