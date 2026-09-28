-- Phase 1 bridge for an existing main database while legacy MAX writers remain.
-- This migration deliberately does not add constraints that reject the legacy
-- parent-row insert with total_ore = 0. Use legacy-transition-order.json; do not
-- substitute or mark the atomic-order migration as applied.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND conname = 'orders_total_positive_ck'
  ) THEN
    RAISE EXCEPTION
      'legacy writer bridge must be applied before orders_total_positive_ck; inspect the real migration ledger';
  END IF;
END
$$;

-- INSERT obtains a table lock before its trigger advances the sequence. Take
-- locks in that same order so finalization cannot deadlock with live writers.
LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE;
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq AS bigint;
ALTER SEQUENCE public.order_number_seq INCREMENT BY 1 MINVALUE 1 NO CYCLE;

SELECT setval(
  'public.order_number_seq',
  GREATEST(
    (SELECT last_value + CASE WHEN is_called THEN 1 ELSE 0 END
      FROM public.order_number_seq),
    COALESCE((
      SELECT MAX(substring(order_number FROM '^#([0-9]+)$')::bigint) + 1
      FROM public.orders
      WHERE order_number ~ '^#[0-9]+$'
    ), 1)
  ),
  false
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_status_token_hash text,
  ADD COLUMN IF NOT EXISTS order_status_token_expires_at timestamptz;

CREATE OR REPLACE FUNCTION public.assign_order_number_from_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_number bigint;
BEGIN
  -- Both live application writers use numeric display numbers. Non-numeric
  -- values are retained only for pre-existing offline/imported records.
  IF NEW.order_number IS NULL OR NEW.order_number ~ '^#[0-9]+$' THEN
    v_number := nextval('public.order_number_seq');
    NEW.order_number := '#' || CASE
      WHEN length(v_number::text) < 4 THEN lpad(v_number::text, 4, '0')
      ELSE v_number::text
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_order_number_from_sequence ON public.orders;
CREATE TRIGGER assign_order_number_from_sequence
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.assign_order_number_from_sequence();

-- Initial signature used before the location compatibility migration. The
-- final trigger-backed signature is installed later in the same bridge phase.
CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_order jsonb,
  p_items jsonb
)
RETURNS TABLE(order_id text, order_number text, total_ore bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id uuid := NULLIF(p_order->>'id', '')::uuid;
  v_order_number text;
  v_total_ore bigint;
BEGIN
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'order id is required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'at least one order item is required' USING ERRCODE = '22023';
  END IF;

  SELECT SUM((item->>'quantity')::bigint * (item->>'price_ore')::bigint)
    INTO v_total_ore FROM jsonb_array_elements(p_items) item;
  IF v_total_ore IS NULL OR v_total_ore <= 0 THEN
    RAISE EXCEPTION 'order total must be positive' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.orders AS inserted (
    id, order_number, status, order_type, payment_method, payment_status,
    total_ore, default_preparation_time_minutes, estimated_ready_at,
    scheduled_at, customer_name, customer_email, customer_phone,
    delivery_info_json, order_status_token_hash, order_status_token_expires_at
  ) VALUES (
    v_order_id, NULL, p_order->>'status', p_order->>'order_type',
    p_order->>'payment_method', p_order->>'payment_status', v_total_ore,
    (p_order->>'default_preparation_time_minutes')::integer,
    (p_order->>'estimated_ready_at')::timestamptz,
    NULLIF(p_order->>'scheduled_at', '')::timestamptz,
    NULLIF(p_order->>'customer_name', ''), NULLIF(p_order->>'customer_email', ''),
    p_order->>'customer_phone', NULLIF(p_order->'delivery_info_json', 'null'::jsonb),
    p_order->>'order_status_token_hash',
    (p_order->>'order_status_token_expires_at')::timestamptz
  ) RETURNING inserted.order_number INTO v_order_number;

  INSERT INTO public.order_items (
    id, order_id, product_id, product_name_snapshot, quantity, price_ore,
    modifications_json
  )
  SELECT (item->>'id')::uuid, v_order_id, NULLIF(item->>'product_id', ''),
    item->>'product_name_snapshot', (item->>'quantity')::integer,
    (item->>'price_ore')::integer,
    NULLIF(item->'modifications_json', 'null'::jsonb)
  FROM jsonb_array_elements(p_items) item;

  RETURN QUERY SELECT v_order_id::text, v_order_number, v_total_ore;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_order_number_from_sequence() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_order_atomic(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_order_number_from_sequence() TO service_role;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(jsonb, jsonb) TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.order_number_seq TO service_role;

COMMIT;
