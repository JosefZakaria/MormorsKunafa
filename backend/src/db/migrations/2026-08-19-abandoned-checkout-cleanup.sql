-- Bounded cleanup for checkout drafts that never reached a payment provider.
-- This deliberately excludes orders with Stripe or Swish identifiers: those
-- require provider reconciliation before deletion can be considered safe.

BEGIN;

CREATE OR REPLACE FUNCTION public.cleanup_uninitiated_checkout_drafts(
  p_before timestamptz,
  p_limit integer DEFAULT 500
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  IF p_before > now() - interval '48 hours' THEN
    RAISE EXCEPTION 'cleanup cutoff must be at least 48 hours old' USING ERRCODE = '22023';
  END IF;
  IF p_limit NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'cleanup batch size must be between 1 and 500' USING ERRCODE = '22023';
  END IF;

  WITH candidates AS (
    SELECT id
    FROM public.orders
    WHERE status = 'ny'
      AND payment_status = 'pending'
      AND payment_method IN ('card', 'swish')
      AND created_at < p_before
      AND stripe_checkout_session_id IS NULL
      AND swish_instruction_id IS NULL
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  DELETE FROM public.orders AS orders
  USING candidates
  WHERE orders.id = candidates.id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_uninitiated_checkout_drafts(timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_uninitiated_checkout_drafts(timestamptz, integer)
  TO service_role;

COMMIT;
