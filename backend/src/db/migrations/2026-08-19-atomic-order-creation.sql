-- Atomic order creation and collision-free display numbers for Supabase/PostgreSQL.
-- Review and apply manually in a controlled maintenance window before deploying
-- backend code that calls create_order_atomic(). This file never runs implicitly.

BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.order_number_seq AS bigint;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_status_token_hash text,
  ADD COLUMN IF NOT EXISTS order_status_token_expires_at timestamptz;

-- Continue above existing numeric display numbers such as #0042. setval(...,
-- false) means the first nextval() returns the calculated value itself.
SELECT setval(
  'public.order_number_seq',
  GREATEST(
    COALESCE((
      SELECT MAX(substring(order_number FROM '^#([0-9]+)$')::bigint) + 1
      FROM public.orders
      WHERE order_number ~ '^#[0-9]+$'
    ), 1),
    1
  ),
  false
);

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
  v_order_id text := p_order->>'id';
  v_order_number text;
  v_total_ore bigint;
BEGIN
  IF v_order_id IS NULL OR v_order_id = '' THEN
    RAISE EXCEPTION 'order id is required' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'at least one order item is required' USING ERRCODE = '22023';
  END IF;

  SELECT SUM((item->>'quantity')::bigint * (item->>'price_ore')::bigint)
  INTO v_total_ore
  FROM jsonb_array_elements(p_items) AS item;

  IF v_total_ore IS NULL OR v_total_ore <= 0 THEN
    RAISE EXCEPTION 'order total must be positive' USING ERRCODE = '23514';
  END IF;

  v_order_number := '#' || lpad(nextval('public.order_number_seq')::text, 4, '0');

  INSERT INTO public.orders (
    id,
    order_number,
    status,
    order_type,
    payment_method,
    payment_status,
    total_ore,
    default_preparation_time_minutes,
    estimated_ready_at,
    scheduled_at,
    customer_name,
    customer_email,
    customer_phone,
    delivery_info_json,
    order_status_token_hash,
    order_status_token_expires_at
  ) VALUES (
    v_order_id,
    v_order_number,
    p_order->>'status',
    p_order->>'order_type',
    p_order->>'payment_method',
    p_order->>'payment_status',
    v_total_ore,
    (p_order->>'default_preparation_time_minutes')::integer,
    (p_order->>'estimated_ready_at')::timestamptz,
    NULLIF(p_order->>'scheduled_at', '')::timestamptz,
    NULLIF(p_order->>'customer_name', ''),
    NULLIF(p_order->>'customer_email', ''),
    p_order->>'customer_phone',
    p_order->'delivery_info_json',
    p_order->>'order_status_token_hash',
    (p_order->>'order_status_token_expires_at')::timestamptz
  );

  INSERT INTO public.order_items (
    id,
    order_id,
    product_id,
    product_name_snapshot,
    quantity,
    price_ore,
    modifications_json
  )
  SELECT
    item->>'id',
    v_order_id,
    NULLIF(item->>'product_id', ''),
    item->>'product_name_snapshot',
    (item->>'quantity')::integer,
    (item->>'price_ore')::integer,
    item->'modifications_json'
  FROM jsonb_array_elements(p_items) AS item;

  RETURN QUERY SELECT v_order_id, v_order_number, v_total_ore;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_atomic(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_order_atomic(jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(jsonb, jsonb) TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.order_number_seq TO service_role;

-- NOT VALID preserves existing historical rows while enforcing constraints for
-- all new writes. Validate each constraint after the preflight queries in the
-- migration guide have returned zero invalid rows.
ALTER TABLE public.orders
  ADD CONSTRAINT orders_total_positive_ck CHECK (total_ore > 0) NOT VALID,
  ADD CONSTRAINT orders_prep_time_ck
    CHECK (default_preparation_time_minutes BETWEEN 1 AND 1440) NOT VALID,
  ADD CONSTRAINT orders_status_ck
    CHECK (status IN ('ny', 'mottagen', 'påbörjad', 'klar', 'avbruten', 'uthämtad', 'levererad')) NOT VALID,
  ADD CONSTRAINT orders_type_ck
    CHECK (order_type IN ('eat-here', 'takeaway', 'delivery')) NOT VALID,
  ADD CONSTRAINT orders_payment_method_ck
    CHECK (payment_method IN ('card', 'swish', 'cash', 'app')) NOT VALID,
  ADD CONSTRAINT orders_payment_status_ck
    CHECK (payment_status IN ('pending', 'paid')) NOT VALID,
  ADD CONSTRAINT orders_status_token_ck CHECK (
    (order_status_token_hash IS NULL AND order_status_token_expires_at IS NULL)
    OR (
      order_status_token_hash ~ '^[A-Za-z0-9_-]{43}$'
      AND order_status_token_expires_at > created_at
    )
  ) NOT VALID;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_quantity_ck CHECK (quantity BETWEEN 1 AND 50) NOT VALID,
  ADD CONSTRAINT order_items_price_positive_ck CHECK (price_ore > 0) NOT VALID;

COMMIT;
