-- Reconcile initiated online payments before deleting abandoned checkout PII.
-- Provider calls happen in the backend; these functions expose a bounded,
-- PII-minimized candidate list and an atomic conditional delete.

BEGIN;

CREATE OR REPLACE FUNCTION public.list_initiated_checkout_drafts(
  p_before timestamptz,
  p_limit integer DEFAULT 40
)
RETURNS TABLE (
  order_id uuid,
  payment_method text,
  total_ore bigint,
  stripe_checkout_session_id text,
  swish_instruction_id text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_before IS NULL OR p_before > now() - interval '24 hours' THEN
    RAISE EXCEPTION 'reconciliation cutoff must be at least 24 hours old'
      USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'reconciliation limit must be between 1 and 100'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    orders.id,
    orders.payment_method::text,
    orders.total_ore::bigint,
    orders.stripe_checkout_session_id::text,
    orders.swish_instruction_id::text
  FROM public.orders AS orders
  WHERE orders.status = 'ny'
    AND orders.payment_status = 'pending'
    AND orders.created_at < p_before
    AND (
      (
        orders.payment_method IN ('card', 'app')
        AND nullif(orders.stripe_checkout_session_id::text, '') IS NOT NULL
        AND nullif(orders.swish_instruction_id::text, '') IS NULL
      )
      OR
      (
        orders.payment_method = 'swish'
        AND nullif(orders.swish_instruction_id::text, '') IS NOT NULL
        AND nullif(orders.stripe_checkout_session_id::text, '') IS NULL
      )
    )
  ORDER BY orders.created_at, orders.id
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_reconciled_checkout_draft(
  p_order_id uuid,
  p_payment_method text,
  p_provider_reference text,
  p_before timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'reconciliation order ID is required'
      USING ERRCODE = '22023';
  END IF;
  IF p_before IS NULL OR p_before > now() - interval '24 hours' THEN
    RAISE EXCEPTION 'reconciliation cutoff must be at least 24 hours old'
      USING ERRCODE = '22023';
  END IF;
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('card', 'app', 'swish') THEN
    RAISE EXCEPTION 'unsupported reconciliation payment method'
      USING ERRCODE = '22023';
  END IF;
  IF p_provider_reference IS NULL
     OR length(p_provider_reference) NOT BETWEEN 1 AND 255
     OR p_provider_reference ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid reconciliation provider reference'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.orders AS orders
  WHERE orders.id = p_order_id
    AND orders.status = 'ny'
    AND orders.payment_status = 'pending'
    AND orders.created_at < p_before
    AND orders.payment_method = p_payment_method
    AND (
      (
        p_payment_method IN ('card', 'app')
        AND orders.stripe_checkout_session_id::text = p_provider_reference
        AND nullif(orders.swish_instruction_id::text, '') IS NULL
      )
      OR
      (
        p_payment_method = 'swish'
        AND orders.swish_instruction_id::text = p_provider_reference
        AND nullif(orders.stripe_checkout_session_id::text, '') IS NULL
      )
    );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.list_initiated_checkout_drafts(timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_initiated_checkout_drafts(timestamptz, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.delete_reconciled_checkout_draft(uuid, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_reconciled_checkout_draft(uuid, text, text, timestamptz)
  TO service_role;

COMMIT;
