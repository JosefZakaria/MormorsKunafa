-- Install fair provider reconciliation before the legacy drain. Repeated
-- bounded calls rotate unresolved drafts without deleting or settling them.

BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS checkout_reconciled_at timestamptz;
COMMIT;

-- Keep index creation from blocking live checkout writes for the duration of
-- a regular transactional index build.
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_checkout_reconciliation_queue_idx
  ON public.orders(checkout_reconciled_at NULLS FIRST, created_at, id)
  WHERE status = 'ny' AND payment_status = 'pending';

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
VOLATILE
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
  WITH candidates AS MATERIALIZED (
    SELECT orders.id
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
    ORDER BY orders.checkout_reconciled_at NULLS FIRST, orders.created_at, orders.id
    LIMIT p_limit
    FOR UPDATE OF orders SKIP LOCKED
  )
  UPDATE public.orders AS orders
  SET checkout_reconciled_at = clock_timestamp()
  FROM candidates
  WHERE orders.id = candidates.id
  RETURNING
    orders.id,
    orders.payment_method::text,
    orders.total_ore::bigint,
    orders.stripe_checkout_session_id::text,
    orders.swish_instruction_id::text;
END;
$$;

REVOKE ALL ON FUNCTION public.list_initiated_checkout_drafts(timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_initiated_checkout_drafts(timestamptz, integer)
  TO service_role;

COMMIT;
