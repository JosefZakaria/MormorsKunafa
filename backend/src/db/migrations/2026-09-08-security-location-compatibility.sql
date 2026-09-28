-- Complements previously applied migrations; preserves the JSON RPC contract.
-- Apply AFTER the locations/stock, atomic-order and RLS migrations.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_order_atomic(p_order jsonb, p_items jsonb)
RETURNS TABLE(order_id text, order_number text, total_ore bigint)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid := (p_order->>'id')::uuid;
  v_number text;
  v_total bigint;
  v_location uuid := NULLIF(p_order->>'location_id', '')::uuid;
BEGIN
  IF v_id IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 26 THEN
    RAISE EXCEPTION 'invalid order input' USING ERRCODE = '22023';
  END IF;
  IF p_order->>'order_type' IN ('eat-here', 'takeaway') AND v_location IS NULL THEN
    RAISE EXCEPTION 'pickup location is required' USING ERRCODE = '22023';
  END IF;
  IF p_order->>'order_type' = 'delivery' AND v_location IS NOT NULL THEN
    RAISE EXCEPTION 'delivery has no pickup location' USING ERRCODE = '22023';
  END IF;
  SELECT SUM((item->>'quantity')::bigint * (item->>'price_ore')::bigint)
    INTO v_total FROM jsonb_array_elements(p_items) item;
  IF v_total IS NULL OR v_total <= 0 THEN
    RAISE EXCEPTION 'order total must be positive' USING ERRCODE = '23514';
  END IF;
  v_number := nextval('public.order_number_seq')::text;
  v_number := '#' || CASE WHEN length(v_number) < 4 THEN lpad(v_number, 4, '0') ELSE v_number END;
  INSERT INTO public.orders (
    id, order_number, status, order_type, payment_method, payment_status, total_ore,
    default_preparation_time_minutes, estimated_ready_at, scheduled_at,
    customer_name, customer_email, customer_phone, delivery_info_json,
    order_status_token_hash, order_status_token_expires_at, location_id
  ) VALUES (
    v_id, v_number, p_order->>'status', p_order->>'order_type', p_order->>'payment_method',
    p_order->>'payment_status', v_total, (p_order->>'default_preparation_time_minutes')::integer,
    (p_order->>'estimated_ready_at')::timestamptz, NULLIF(p_order->>'scheduled_at', '')::timestamptz,
    NULLIF(p_order->>'customer_name', ''), NULLIF(p_order->>'customer_email', ''),
    p_order->>'customer_phone', NULLIF(p_order->'delivery_info_json', 'null'::jsonb),
    p_order->>'order_status_token_hash', (p_order->>'order_status_token_expires_at')::timestamptz, v_location
  );
  INSERT INTO public.order_items (id, order_id, product_id, product_name_snapshot, quantity, price_ore, modifications_json)
  SELECT (item->>'id')::uuid, v_id, NULLIF(item->>'product_id', ''),
    item->>'product_name_snapshot', (item->>'quantity')::integer, (item->>'price_ore')::integer,
    NULLIF(item->'modifications_json', 'null'::jsonb)
  FROM jsonb_array_elements(p_items) item;
  RETURN QUERY SELECT v_id::text, v_number, v_total;
END;
$$;
REVOKE ALL ON FUNCTION public.create_order_atomic(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(jsonb, jsonb) TO service_role;

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.product_location_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_location_stock FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.locations, public.product_location_stock FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations, public.product_location_stock TO service_role;
COMMIT;
