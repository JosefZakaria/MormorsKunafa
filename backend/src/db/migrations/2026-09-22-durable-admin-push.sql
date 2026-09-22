-- Apply before deploying the backend that writes orders.push_event_id.
-- All functions are called only with the backend service-role key.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS push_event_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS orders_push_event_id_uq
  ON public.orders (push_event_id) WHERE push_event_id IS NOT NULL;

-- Historic subscriptions without an admin cannot receive an order notification.
DELETE FROM public.admin_push_subscriptions AS subscription
WHERE NOT EXISTS (
  SELECT 1 FROM public.admin_users AS admin WHERE admin.id = subscription.admin_id
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.admin_push_subscriptions'::regclass
      AND conname = 'admin_push_subscriptions_admin_id_fkey'
  ) THEN
    ALTER TABLE public.admin_push_subscriptions
      ADD CONSTRAINT admin_push_subscriptions_admin_id_fkey
      FOREIGN KEY (admin_id) REFERENCES public.admin_users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.admin_push_outbox (
  event_id uuid PRIMARY KEY,
  order_id varchar NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  order_type text NOT NULL,
  location_id uuid,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'leased', 'done', 'dead')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_push_outbox_due_idx
  ON public.admin_push_outbox (next_attempt_at, created_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS admin_push_outbox_lease_idx
  ON public.admin_push_outbox (lease_until)
  WHERE status = 'leased';

ALTER TABLE public.admin_push_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_push_outbox FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_push_outbox TO service_role;

-- Repeated attempts update the single event/subscription record.
ALTER TABLE public.admin_push_delivery_logs
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Repair the gap when payment commits but the function stops before its first
-- background send. The event id was committed with payment_status in one row.
CREATE OR REPLACE FUNCTION public.reconcile_admin_push_outbox(p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  inserted_count integer;
BEGIN
  INSERT INTO public.admin_push_outbox (event_id, order_id, order_type, location_id)
  SELECT orders.push_event_id, orders.id, orders.order_type, orders.location_id
  FROM public.orders AS orders
  WHERE orders.payment_status = 'paid'
    AND orders.push_event_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.admin_push_outbox AS outbox
      WHERE outbox.order_id = orders.id
    )
  ORDER BY orders.updated_at ASC
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
  ON CONFLICT (order_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

-- SKIP LOCKED and a lease token allow several Vercel instances to drain safely.
CREATE OR REPLACE FUNCTION public.claim_admin_push_outbox(p_limit integer DEFAULT 10)
RETURNS SETOF public.admin_push_outbox
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH due AS (
    SELECT event_id
    FROM public.admin_push_outbox
    WHERE (status = 'pending' AND next_attempt_at <= now())
       OR (status = 'leased' AND lease_until < now())
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 10)
  )
  UPDATE public.admin_push_outbox AS outbox
  SET status = 'leased',
      attempts = outbox.attempts + 1,
      lease_token = gen_random_uuid(),
      lease_until = now() + interval '120 seconds',
      updated_at = now()
  FROM due
  WHERE outbox.event_id = due.event_id
  RETURNING outbox.*;
$$;

REVOKE ALL ON FUNCTION public.reconcile_admin_push_outbox(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_admin_push_outbox(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_admin_push_outbox(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_admin_push_outbox(integer) TO service_role;
