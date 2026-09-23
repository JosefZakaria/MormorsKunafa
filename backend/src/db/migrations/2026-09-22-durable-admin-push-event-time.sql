-- Keep the 15-minute alert deadline tied to payment, including after a worker outage.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS push_event_created_at timestamptz;

CREATE OR REPLACE FUNCTION public.reconcile_admin_push_outbox(p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  inserted_count integer;
BEGIN
  INSERT INTO public.admin_push_outbox (event_id, order_id, order_type, location_id, created_at)
  SELECT orders.push_event_id, orders.id, orders.order_type, orders.location_id,
         coalesce(orders.push_event_created_at, now())
  FROM public.orders AS orders
  WHERE orders.payment_status = 'paid'
    AND orders.push_event_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.admin_push_outbox AS outbox
      WHERE outbox.order_id = orders.id
    )
  ORDER BY orders.push_event_created_at ASC NULLS LAST
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
  ON CONFLICT (order_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_admin_push_outbox(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_admin_push_outbox(integer) TO service_role;
