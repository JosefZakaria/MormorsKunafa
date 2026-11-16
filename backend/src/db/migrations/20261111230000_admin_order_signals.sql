-- Admin screens refresh on a private Realtime broadcast instead of polling every few seconds.
-- The payload is empty: no customer data leaves the database. Screens fetch orders through Express.
-- Give up instead of queueing order writes behind this migration if the tables are busy.
SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.notify_admin_orders_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- An order write must never fail because of the signal; screens still poll as a safety net.
  BEGIN
    PERFORM realtime.send('{}'::jsonb, 'orders_changed', 'admin-orders', true);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'admin order signal failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_admin_orders_changed() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER orders_notify_admin
  AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH STATEMENT EXECUTE FUNCTION public.notify_admin_orders_changed();

-- Web orders insert their items after the order row; signal again so screens never keep an empty order.
CREATE TRIGGER order_items_notify_admin
  AFTER INSERT ON public.order_items
  FOR EACH STATEMENT EXECUTE FUNCTION public.notify_admin_orders_changed();

-- Only tokens minted by the backend for a signed-in admin carry mk_admin. The public key cannot listen,
-- and with no INSERT policy no client can send fake signals.
CREATE POLICY "admin screens receive order signals"
  ON realtime.messages FOR SELECT TO anon
  USING (
    realtime.topic() = 'admin-orders'
    AND extension = 'broadcast'
    AND (SELECT auth.jwt() ->> 'mk_admin') = 'true'
  );
