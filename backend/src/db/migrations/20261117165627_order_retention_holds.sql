-- Apply before deploying retention controls. Installation does not erase any customer fields.
BEGIN;
CREATE TABLE public.order_retention_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  fields text[] NOT NULL CHECK (
    cardinality(fields) BETWEEN 1 AND 6
    AND array_position(fields, NULL) IS NULL
    AND fields <@ ARRAY['contact','delivery_contact','identity_address','notes','purchase_details','payment_details']::text[]
  ),
  reason text NOT NULL CHECK (reason IN ('payment','complaint','dispute','restriction')),
  responsible_admin_id text NOT NULL CHECK (length(btrim(responsible_admin_id)) > 0),
  responsible_name text NOT NULL CHECK (length(btrim(responsible_name)) > 0),
  review_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  released_by text,
  CHECK ((released_at IS NULL) = (released_by IS NULL))
);
CREATE INDEX order_retention_holds_order_idx ON public.order_retention_holds (order_id, created_at DESC);
ALTER TABLE public.order_retention_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_retention_holds FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.order_retention_holds TO service_role;
GRANT UPDATE (released_at, released_by) ON public.order_retention_holds TO service_role;
COMMENT ON TABLE public.order_retention_holds IS 'Field-specific case exceptions. review_on is a review date, never automatic expiry. No customer content is copied here.';

CREATE TABLE public.order_retention_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL,
  fields text[] NOT NULL CHECK (cardinality(fields) BETWEEN 1 AND 4 AND fields <@ ARRAY['contact','delivery_contact','identity_address','notes']::text[]),
  rule text NOT NULL CHECK (rule IN ('abandoned_30_days','closed_order','purpose_ended')),
  performed_by text NOT NULL,
  performed_at timestamptz NOT NULL DEFAULT now(),
  closed_on date
);
ALTER TABLE public.order_retention_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_retention_runs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.order_retention_runs TO service_role;

-- One transaction: lock, recheck source/holds, clear selected fields, then append a content-free audit record.
CREATE FUNCTION public.apply_order_retention(
  p_order_id text, p_expected jsonb, p_fields text[], p_rule text, p_admin_id text,
  p_confirmed boolean, p_closed_on date, p_notes_operational boolean, p_last_expiry timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  current_order public.orders%ROWTYPE;
  original jsonb;
  run_id uuid;
  performed timestamptz := clock_timestamp();
  today date := (performed AT TIME ZONE 'Europe/Stockholm')::date;
BEGIN
  IF p_confirmed IS DISTINCT FROM true OR nullif(btrim(p_admin_id), '') IS NULL
    OR p_rule IS NULL OR p_rule NOT IN ('abandoned_30_days','closed_order','purpose_ended')
    OR p_fields IS NULL OR cardinality(p_fields) NOT BETWEEN 1 AND 4 OR array_position(p_fields, NULL) IS NOT NULL
    OR NOT p_fields <@ ARRAY['contact','delivery_contact','identity_address','notes']::text[]
    OR (SELECT count(DISTINCT field) FROM unnest(p_fields) field) <> cardinality(p_fields)
    OR ('notes' = ANY(p_fields) AND p_notes_operational IS DISTINCT FROM true) THEN
    RAISE EXCEPTION 'Invalid retention request' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE id=p_admin_id AND role='owner') THEN
    RAISE EXCEPTION 'Current owner access is required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO current_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order no longer exists' USING ERRCODE='40001'; END IF;
  original := to_jsonb(current_order);
  IF p_expected IS NULL OR jsonb_typeof(p_expected) <> 'object'
    OR NOT p_expected ?& ARRAY['id','status','payment_status','updated_at','created_at','total_ore','stripe_checkout_session_id','customer_name','customer_phone','customer_email','delivery_info_json','internal_notes']
    OR NOT original @> p_expected THEN
    RAISE EXCEPTION 'Order changed since verification' USING ERRCODE='40001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.order_retention_holds WHERE order_id=p_order_id AND released_at IS NULL AND fields && p_fields) THEN
    RAISE EXCEPTION 'Selected fields have an active hold' USING ERRCODE='40001';
  END IF;
  IF current_order.created_at IS NULL OR current_order.created_at > performed AT TIME ZONE 'UTC'
    OR (current_order.scheduled_at IS NOT NULL AND current_order.scheduled_at > performed AT TIME ZONE 'UTC') THEN
    RAISE EXCEPTION 'Order dates require review' USING ERRCODE='22023';
  END IF;
  IF p_rule='abandoned_30_days' THEN
    IF current_order.status <> 'ny' OR current_order.payment_status <> 'pending'
      OR current_order.payment_method NOT IN ('card','app') OR coalesce(current_order.refund_status,'none') <> 'none'
      OR nullif(btrim(current_order.stripe_checkout_session_id),'') IS NULL OR current_order.total_ore <= 0
      OR p_last_expiry IS NULL OR p_last_expiry > performed - INTERVAL '720 hours'
      OR current_order.created_at > (performed - INTERVAL '720 hours') AT TIME ZONE 'UTC'
      OR p_last_expiry < current_order.created_at AT TIME ZONE 'UTC' THEN
      RAISE EXCEPTION 'Abandoned attempt is not eligible' USING ERRCODE='22023';
    END IF;
  ELSE
    IF current_order.status NOT IN ('klar','uthämtad','levererad','avbruten')
      OR (current_order.status <> 'avbruten' AND current_order.payment_status <> 'paid')
      OR coalesce(current_order.refund_status,'none') NOT IN ('none','refunded')
      OR (p_rule='purpose_ended' AND current_order.payment_status <> 'paid')
      OR 'identity_address' = ANY(p_fields) OR p_closed_on IS NULL OR p_closed_on > today
      OR p_closed_on < greatest(
        (current_order.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Stockholm')::date,
        (current_order.scheduled_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Stockholm')::date,
        (current_order.completed_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Stockholm')::date,
        (current_order.cancelled_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Stockholm')::date)
      OR (p_rule='closed_order' AND p_fields && ARRAY['contact','delivery_contact']::text[] AND (p_closed_on + INTERVAL '3 years')::date > today)
      OR (p_rule='closed_order' AND 'notes' = ANY(p_fields) AND p_closed_on + 90 > today)
      OR (p_fields && ARRAY['contact','delivery_contact']::text[]
        AND nullif(btrim(current_order.customer_name),'') IS NULL AND nullif(btrim(current_order.delivery_info_json->>'name'),'') IS NULL) THEN
      RAISE EXCEPTION 'Closure, retention period or accounting identity requires review' USING ERRCODE='22023';
    END IF;
  END IF;
  IF p_fields && ARRAY['delivery_contact','identity_address']::text[]
    AND current_order.delivery_info_json IS NOT NULL AND jsonb_typeof(current_order.delivery_info_json) <> 'object' THEN
    RAISE EXCEPTION 'Delivery information requires review' USING ERRCODE='22023';
  END IF;
  IF 'contact' = ANY(p_fields) THEN current_order.customer_phone := NULL; current_order.customer_email := NULL; END IF;
  IF 'delivery_contact' = ANY(p_fields) THEN current_order.delivery_info_json := current_order.delivery_info_json - ARRAY['phone','email']; END IF;
  IF 'identity_address' = ANY(p_fields) THEN
    current_order.customer_name := NULL;
    current_order.delivery_info_json := current_order.delivery_info_json - ARRAY['name','address','postalCode','city'];
  END IF;
  IF 'notes' = ANY(p_fields) THEN current_order.internal_notes := NULL; END IF;
  IF original = to_jsonb(current_order) THEN RAISE EXCEPTION 'Selected fields are already empty' USING ERRCODE='40001'; END IF;
  UPDATE public.orders SET customer_name=current_order.customer_name, customer_phone=current_order.customer_phone,
    customer_email=current_order.customer_email, internal_notes=current_order.internal_notes,
    delivery_info_json=current_order.delivery_info_json, updated_at=performed AT TIME ZONE 'UTC'
    WHERE id=p_order_id;
  INSERT INTO public.order_retention_runs(order_id, fields, rule, performed_by, performed_at, closed_on)
    VALUES (p_order_id, p_fields, p_rule, p_admin_id, performed, p_closed_on) RETURNING id INTO run_id;
  RETURN jsonb_build_object('runId',run_id,'orderId',p_order_id,'fields',p_fields,'performedAt',performed);
END;
$function$;
REVOKE ALL ON FUNCTION public.apply_order_retention(text,jsonb,text[],text,text,boolean,date,boolean,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_order_retention(text,jsonb,text[],text,text,boolean,date,boolean,timestamptz) TO service_role;
COMMIT;
