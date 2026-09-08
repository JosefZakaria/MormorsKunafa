-- Complement existing retention RPCs: unresolved payments and refunds retain their evidence.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.preview_operational_order_pii_retention(
  p_before timestamptz,
  p_scope text,
  p_limit integer DEFAULT 100
)
RETURNS TABLE(
  order_id uuid,
  order_number text,
  terminal_at timestamptz,
  order_status text,
  payment_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_scope IS NULL OR p_scope NOT IN ('operational_details', 'customer_contact') THEN
    RAISE EXCEPTION 'invalid retention scope' USING ERRCODE = '22023';
  END IF;
  IF p_before IS NULL
    OR (p_scope = 'operational_details' AND p_before > now() - interval '90 days')
    OR (p_scope = 'customer_contact' AND p_before > now() - interval '1095 days')
  THEN
    RAISE EXCEPTION 'retention cutoff is newer than the approved scope period' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'retention batch size must be between 1 and 500' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    orders.id,
    orders.order_number::text,
    COALESCE(orders.completed_at, orders.cancelled_at, orders.updated_at, orders.created_at),
    orders.status::text,
    orders.payment_status::text
  FROM public.orders
  WHERE orders.operational_pii_legal_hold = false
    AND orders.status IN ('uthämtad', 'levererad', 'avbruten')
    AND (orders.payment_method NOT IN ('card', 'app', 'swish') OR orders.payment_status = 'paid')
    AND COALESCE(orders.refund_status, 'none') <> 'pending'
    AND NOT EXISTS (SELECT 1 FROM public.order_refunds r WHERE r.order_id = orders.id AND r.status = 'pending')
    AND NOT EXISTS (SELECT 1 FROM public.duplicate_stripe_refunds r WHERE r.order_id = orders.id AND r.status = 'pending')
    AND NOT EXISTS (SELECT 1 FROM public.payment_provider_events e
      WHERE e.provider = 'stripe' AND e.order_id = orders.id::text AND e.outcome = 'alert_paid_session_validation_failed'
        AND NOT EXISTS (SELECT 1 FROM public.duplicate_stripe_refunds r WHERE r.stripe_event_id = e.event_id AND r.status = 'succeeded'))
    AND COALESCE(orders.completed_at, orders.cancelled_at, orders.updated_at, orders.created_at) < p_before
    AND (
      (
        p_scope = 'operational_details'
        AND orders.operational_details_purged_at IS NULL
        AND (
          orders.delivery_info_json IS NOT NULL
          OR orders.internal_notes IS NOT NULL
          OR orders.cancellation_reason IS NOT NULL
          OR orders.order_status_token_hash IS NOT NULL
          OR orders.order_status_token_expires_at IS NOT NULL
          OR EXISTS (
            SELECT 1
            FROM public.order_items
            WHERE order_items.order_id = orders.id
              AND order_items.modifications_json IS NOT NULL
          )
        )
      )
      OR (
        p_scope = 'customer_contact'
        AND orders.operational_pii_anonymized_at IS NULL
        AND (
          orders.customer_name IS NOT NULL
          OR orders.customer_email IS NOT NULL
          OR COALESCE(orders.customer_phone, '') <> ''
        )
      )
    )
  ORDER BY
    COALESCE(orders.completed_at, orders.cancelled_at, orders.updated_at, orders.created_at),
    orders.id
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.anonymize_operational_order_pii(
  p_before timestamptz,
  p_scope text,
  p_limit integer DEFAULT 100
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_changed integer;
  v_locked_ids uuid[];
BEGIN
  IF p_scope IS NULL OR p_scope NOT IN ('operational_details', 'customer_contact') THEN
    RAISE EXCEPTION 'invalid retention scope' USING ERRCODE = '22023';
  END IF;
  IF p_before IS NULL
    OR (p_scope = 'operational_details' AND p_before > now() - interval '90 days')
    OR (p_scope = 'customer_contact' AND p_before > now() - interval '1095 days')
  THEN
    RAISE EXCEPTION 'retention cutoff is newer than the approved scope period' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'retention batch size must be between 1 and 500' USING ERRCODE = '22023';
  END IF;

  -- Refund reservation holds the same order lock. Acquire locks in one SQL
  -- statement, then re-evaluate all predicates with a fresh READ COMMITTED
  -- snapshot before scrubbing anything in the following statement.
  SELECT array_agg(locked.id) INTO v_locked_ids FROM (
    SELECT o.id FROM public.orders o
    JOIN public.preview_operational_order_pii_retention(p_before,p_scope,p_limit) eligible ON eligible.order_id=o.id
    ORDER BY COALESCE(o.completed_at,o.cancelled_at,o.updated_at,o.created_at),o.id
    FOR UPDATE OF o SKIP LOCKED
  ) locked;
  IF v_locked_ids IS NULL THEN RETURN 0; END IF;

  IF p_scope = 'operational_details' THEN
    WITH candidates AS (
      SELECT orders.id
      FROM public.orders
      WHERE orders.operational_details_purged_at IS NULL
        AND orders.id = ANY(v_locked_ids)
        AND orders.operational_pii_legal_hold = false
        AND orders.status IN ('uthämtad', 'levererad', 'avbruten')
    AND (orders.payment_method NOT IN ('card', 'app', 'swish') OR orders.payment_status = 'paid')
    AND COALESCE(orders.refund_status, 'none') <> 'pending'
    AND NOT EXISTS (SELECT 1 FROM public.order_refunds r WHERE r.order_id = orders.id AND r.status = 'pending')
    AND NOT EXISTS (SELECT 1 FROM public.duplicate_stripe_refunds r WHERE r.order_id = orders.id AND r.status = 'pending')
    AND NOT EXISTS (SELECT 1 FROM public.payment_provider_events e
      WHERE e.provider = 'stripe' AND e.order_id = orders.id::text AND e.outcome = 'alert_paid_session_validation_failed'
        AND NOT EXISTS (SELECT 1 FROM public.duplicate_stripe_refunds r WHERE r.stripe_event_id = e.event_id AND r.status = 'succeeded'))
        AND COALESCE(orders.completed_at, orders.cancelled_at, orders.updated_at, orders.created_at) < p_before
        AND (
          orders.delivery_info_json IS NOT NULL
          OR orders.internal_notes IS NOT NULL
          OR orders.cancellation_reason IS NOT NULL
          OR orders.order_status_token_hash IS NOT NULL
          OR orders.order_status_token_expires_at IS NOT NULL
          OR EXISTS (
            SELECT 1 FROM public.order_items
            WHERE order_items.order_id = orders.id
              AND order_items.modifications_json IS NOT NULL
          )
        )
      ORDER BY COALESCE(orders.completed_at, orders.cancelled_at, orders.updated_at, orders.created_at), orders.id
      FOR UPDATE OF orders SKIP LOCKED
      LIMIT p_limit
    ),
    scrubbed_items AS (
      UPDATE public.order_items
      SET modifications_json = NULL
      WHERE order_id IN (SELECT id FROM candidates)
      RETURNING order_id
    ),
    scrubbed_orders AS (
      UPDATE public.orders
      SET
        delivery_info_json = NULL,
        internal_notes = NULL,
        cancellation_reason = NULL,
        order_status_token_hash = NULL,
        order_status_token_expires_at = NULL,
        operational_details_purged_at = now()
      WHERE id IN (SELECT id FROM candidates)
        AND operational_details_purged_at IS NULL
        AND operational_pii_legal_hold = false
      RETURNING id
    ),
    audit_rows AS (
      INSERT INTO public.security_audit_log (
        event_id, action, resource_type, resource_id, outcome
      )
      SELECT
        gen_random_uuid(),
        'operational_order_details_purged',
        'order',
        scrubbed_orders.id::text,
        'succeeded'
      FROM scrubbed_orders
      RETURNING resource_id
    )
    SELECT count(*)::integer INTO v_changed FROM audit_rows;

    RETURN v_changed;
  END IF;

  -- The contact pass also removes any old operational details missed by the
  -- shorter pass, so no free text survives merely because a scheduler failed.
  WITH candidates AS (
    SELECT orders.id
    FROM public.orders
    WHERE orders.operational_pii_anonymized_at IS NULL
      AND orders.id = ANY(v_locked_ids)
      AND orders.operational_pii_legal_hold = false
      AND orders.status IN ('uthämtad', 'levererad', 'avbruten')
    AND (orders.payment_method NOT IN ('card', 'app', 'swish') OR orders.payment_status = 'paid')
    AND COALESCE(orders.refund_status, 'none') <> 'pending'
    AND NOT EXISTS (SELECT 1 FROM public.order_refunds r WHERE r.order_id = orders.id AND r.status = 'pending')
    AND NOT EXISTS (SELECT 1 FROM public.duplicate_stripe_refunds r WHERE r.order_id = orders.id AND r.status = 'pending')
    AND NOT EXISTS (SELECT 1 FROM public.payment_provider_events e
      WHERE e.provider = 'stripe' AND e.order_id = orders.id::text AND e.outcome = 'alert_paid_session_validation_failed'
        AND NOT EXISTS (SELECT 1 FROM public.duplicate_stripe_refunds r WHERE r.stripe_event_id = e.event_id AND r.status = 'succeeded'))
      AND COALESCE(orders.completed_at, orders.cancelled_at, orders.updated_at, orders.created_at) < p_before
      AND (
        orders.customer_name IS NOT NULL
        OR orders.customer_email IS NOT NULL
        OR COALESCE(orders.customer_phone, '') <> ''
      )
    ORDER BY COALESCE(orders.completed_at, orders.cancelled_at, orders.updated_at, orders.created_at), orders.id
    FOR UPDATE OF orders SKIP LOCKED
    LIMIT p_limit
  ),
  scrubbed_items AS (
    UPDATE public.order_items
    SET modifications_json = NULL
    WHERE order_id IN (SELECT id FROM candidates)
    RETURNING order_id
  ),
  scrubbed_orders AS (
    UPDATE public.orders
    SET
      customer_name = NULL,
      customer_email = NULL,
      customer_phone = '',
      delivery_info_json = NULL,
      internal_notes = NULL,
      cancellation_reason = NULL,
      order_status_token_hash = NULL,
      order_status_token_expires_at = NULL,
      operational_details_purged_at = COALESCE(operational_details_purged_at, now()),
      operational_pii_anonymized_at = now()
    WHERE id IN (SELECT id FROM candidates)
      AND operational_pii_anonymized_at IS NULL
      AND operational_pii_legal_hold = false
    RETURNING id
  ),
  audit_rows AS (
    INSERT INTO public.security_audit_log (
      event_id, action, resource_type, resource_id, outcome
    )
    SELECT
      gen_random_uuid(),
      'operational_order_contact_anonymized',
      'order',
      scrubbed_orders.id::text,
      'succeeded'
    FROM scrubbed_orders
    RETURNING resource_id
  )
  SELECT count(*)::integer INTO v_changed FROM audit_rows;

  RETURN v_changed;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_operational_order_pii_retention(timestamptz, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_operational_order_pii_retention(timestamptz, text, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.anonymize_operational_order_pii(timestamptz, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_operational_order_pii(timestamptz, text, integer)
  TO service_role;

COMMIT;
