-- Phase 4 for a legacy upgrade. Run only after every old backend process and
-- alias has been drained and stale browser mutations reach the version guard.
-- Existing zero/partial orders remain visible for reconciliation; NOT VALID
-- constraints protect new writes without rewriting or deleting history.

BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS checkout_reconciled_at timestamptz;
COMMIT;

-- Avoid holding a write-blocking index build while the new checkout stays live.
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_checkout_reconciliation_queue_idx
  ON public.orders(checkout_reconciled_at NULLS FIRST, created_at, id)
  WHERE status = 'ny' AND payment_status = 'pending';

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.orders'::regclass
      AND tgname = 'assign_order_number_from_sequence'
      AND NOT tgisinternal
      AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'shared order-number allocator is missing or disabled';
  END IF;
END
$$;

-- Trigger-backed INSERT takes the table before the sequence. Match that order.
LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE;
ALTER SEQUENCE public.order_number_seq INCREMENT BY 1 MINVALUE 1 NO CYCLE;
SELECT setval('public.order_number_seq', GREATEST(
  (SELECT last_value + CASE WHEN is_called THEN 1 ELSE 0 END FROM public.order_number_seq),
  COALESCE((SELECT max(substring(order_number FROM '^#([0-9]+)$')::bigint) + 1
    FROM public.orders WHERE order_number ~ '^#[0-9]+$'), 1)
), false);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.orders'::regclass AND conname='orders_total_positive_ck') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_total_positive_ck CHECK (total_ore > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.orders'::regclass AND conname='orders_prep_time_ck') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_prep_time_ck CHECK (default_preparation_time_minutes BETWEEN 1 AND 1440) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.orders'::regclass AND conname='orders_status_ck') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_status_ck CHECK (status IN ('ny', 'mottagen', 'påbörjad', 'klar', 'avbruten', 'uthämtad', 'levererad')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.orders'::regclass AND conname='orders_type_ck') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_type_ck CHECK (order_type IN ('eat-here', 'takeaway', 'delivery')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.orders'::regclass AND conname='orders_payment_method_ck') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_ck CHECK (payment_method IN ('card', 'swish', 'cash', 'app')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.orders'::regclass AND conname='orders_payment_status_ck') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_ck CHECK (payment_status IN ('pending', 'paid')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.orders'::regclass AND conname='orders_status_token_ck') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_status_token_ck CHECK (
      (order_status_token_hash IS NULL AND order_status_token_expires_at IS NULL)
      OR (order_status_token_hash ~ '^[A-Za-z0-9_-]{43}$' AND order_status_token_expires_at > created_at)
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.order_items'::regclass AND conname='order_items_quantity_ck') THEN
    ALTER TABLE public.order_items ADD CONSTRAINT order_items_quantity_ck CHECK (quantity BETWEEN 1 AND 50) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.order_items'::regclass AND conname='order_items_price_positive_ck') THEN
    ALTER TABLE public.order_items ADD CONSTRAINT order_items_price_positive_ck CHECK (price_ore > 0) NOT VALID;
  END IF;
END
$$;

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
