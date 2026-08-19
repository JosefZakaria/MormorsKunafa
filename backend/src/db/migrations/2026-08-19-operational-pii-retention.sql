-- Bounded, auditable anonymization of operational order contact data.
-- Apply after the immutable security-audit migration. This migration never
-- schedules or executes anonymization by itself.

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS operational_pii_legal_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS operational_pii_anonymized_at timestamptz;

CREATE INDEX IF NOT EXISTS orders_operational_pii_retention_idx
  ON public.orders (updated_at, id)
  WHERE operational_pii_anonymized_at IS NULL
    AND operational_pii_legal_hold = false;

CREATE OR REPLACE FUNCTION public.preview_operational_order_pii_retention(
  p_before timestamptz,
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
  IF p_before IS NULL OR p_before > now() - interval '30 days' THEN
    RAISE EXCEPTION 'retention cutoff must be at least 30 days old' USING ERRCODE = '22023';
  END IF;
  IF p_limit NOT BETWEEN 1 AND 500 THEN
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
  WHERE orders.operational_pii_anonymized_at IS NULL
    AND orders.operational_pii_legal_hold = false
    AND orders.status IN ('uthämtad', 'levererad', 'avbruten')
    AND COALESCE(orders.completed_at, orders.cancelled_at, orders.updated_at, orders.created_at) < p_before
    AND (
      orders.customer_name IS NOT NULL
      OR orders.customer_email IS NOT NULL
      OR COALESCE(orders.customer_phone, '') <> ''
      OR orders.delivery_info_json IS NOT NULL
      OR orders.internal_notes IS NOT NULL
      OR orders.cancellation_reason IS NOT NULL
      OR EXISTS (
        SELECT 1
        FROM public.order_items
        WHERE order_items.order_id = orders.id
          AND order_items.modifications_json IS NOT NULL
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
  p_limit integer DEFAULT 100
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_anonymized integer;
BEGIN
  IF p_before IS NULL OR p_before > now() - interval '30 days' THEN
    RAISE EXCEPTION 'retention cutoff must be at least 30 days old' USING ERRCODE = '22023';
  END IF;
  IF p_limit NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'retention batch size must be between 1 and 500' USING ERRCODE = '22023';
  END IF;

  WITH candidates AS (
    SELECT orders.id
    FROM public.orders
    WHERE orders.operational_pii_anonymized_at IS NULL
      AND orders.operational_pii_legal_hold = false
      AND orders.status IN ('uthämtad', 'levererad', 'avbruten')
      AND COALESCE(orders.completed_at, orders.cancelled_at, orders.updated_at, orders.created_at) < p_before
      AND (
        orders.customer_name IS NOT NULL
        OR orders.customer_email IS NOT NULL
        OR COALESCE(orders.customer_phone, '') <> ''
        OR orders.delivery_info_json IS NOT NULL
        OR orders.internal_notes IS NOT NULL
        OR orders.cancellation_reason IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM public.order_items
          WHERE order_items.order_id = orders.id
            AND order_items.modifications_json IS NOT NULL
        )
      )
    ORDER BY
      COALESCE(orders.completed_at, orders.cancelled_at, orders.updated_at, orders.created_at),
      orders.id
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
      'operational_order_pii_anonymized',
      'order',
      scrubbed_orders.id::text,
      'succeeded'
    FROM scrubbed_orders
    RETURNING resource_id
  )
  SELECT count(*)::integer INTO v_anonymized FROM audit_rows;

  RETURN v_anonymized;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_operational_order_pii_retention(timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_operational_order_pii_retention(timestamptz, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.anonymize_operational_order_pii(timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_operational_order_pii(timestamptz, integer)
  TO service_role;

COMMIT;
