-- Directional guard also protects older application processes during rollout.
-- Existing cancelled orders may still receive a genuine late provider payment.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE OR REPLACE FUNCTION public.guard_online_order_cancellation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'avbruten' AND OLD.status IS DISTINCT FROM 'avbruten'
    AND lower(btrim(NEW.payment_method)) IN ('card', 'app', 'swish')
    AND (NEW.payment_status IS DISTINCT FROM 'paid' OR NEW.refund_status IS DISTINCT FROM 'refunded') THEN
    RAISE EXCEPTION 'online cancellation requires a confirmed full refund' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_online_order_cancellation ON public.orders;
CREATE TRIGGER guard_online_order_cancellation BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_online_order_cancellation();
REVOKE ALL ON FUNCTION public.guard_online_order_cancellation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_online_order_cancellation() TO service_role;
COMMIT;
