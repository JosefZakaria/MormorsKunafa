-- Apply with old order writers stopped. They allocate MAX(number), not nextval.
-- Never rerun the original sequence initializer on an existing installation.
BEGIN;
SET LOCAL lock_timeout = '5s';
-- Lock the sequence before the orders table, matching create_order_atomic.
ALTER SEQUENCE public.order_number_seq NO CYCLE;
LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE;
SELECT setval('public.order_number_seq', GREATEST(
  (SELECT last_value + CASE WHEN is_called THEN 1 ELSE 0 END FROM public.order_number_seq),
  COALESCE((SELECT max(substring(order_number FROM '^#([0-9]+)$')::bigint) + 1
    FROM public.orders WHERE order_number ~ '^#[0-9]+$'), 1)
), false);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS checkout_reconciled_at timestamptz;
CREATE INDEX IF NOT EXISTS orders_checkout_reconciliation_queue_idx
  ON public.orders(checkout_reconciled_at NULLS FIRST, created_at, id)
  WHERE status = 'ny' AND payment_status = 'pending';

-- Keep the existing RPC signature for older backend processes. An inconclusive
-- provider response retains the order but moves it behind unexamined drafts.
CREATE OR REPLACE FUNCTION public.list_initiated_checkout_drafts(
  p_before timestamptz, p_limit integer DEFAULT 40
)
RETURNS TABLE(order_id uuid, payment_method text, total_ore bigint,
  stripe_checkout_session_id text, swish_instruction_id text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_before IS NULL OR p_before > now() - interval '24 hours' THEN
    RAISE EXCEPTION 'reconciliation cutoff must be at least 24 hours old' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'reconciliation limit must be between 1 and 100' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT o.id FROM public.orders o
    WHERE o.status = 'ny' AND o.payment_status = 'pending' AND o.created_at < p_before
      AND ((o.payment_method IN ('card','app') AND nullif(o.stripe_checkout_session_id::text,'') IS NOT NULL
        AND nullif(o.swish_instruction_id::text,'') IS NULL)
        OR (o.payment_method = 'swish' AND nullif(o.swish_instruction_id::text,'') IS NOT NULL
        AND nullif(o.stripe_checkout_session_id::text,'') IS NULL))
    ORDER BY o.checkout_reconciled_at NULLS FIRST, o.created_at, o.id
    LIMIT p_limit FOR UPDATE OF o SKIP LOCKED
  )
  UPDATE public.orders o SET checkout_reconciled_at = clock_timestamp()
    FROM candidates c WHERE o.id = c.id
    RETURNING o.id, o.payment_method::text, o.total_ore::bigint,
      o.stripe_checkout_session_id::text, o.swish_instruction_id::text;
END;
$$;
REVOKE ALL ON FUNCTION public.list_initiated_checkout_drafts(timestamptz,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_initiated_checkout_drafts(timestamptz,integer) TO service_role;
COMMIT;
