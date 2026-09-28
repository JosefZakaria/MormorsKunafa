-- Item-allocated provider refund ledger with serialized reservation and
-- immutable audit transitions. Apply manually after the security audit
-- migration and before deploying the matching backend.

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS refunded_amount_ore bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.order_refunds (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  amount_ore bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  idempotency_key text NOT NULL,
  selection_json jsonb NOT NULL,
  provider_refund_id text,
  requested_by_admin_id text NOT NULL,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT order_refunds_provider_ck CHECK (provider IN ('stripe', 'swish')),
  CONSTRAINT order_refunds_amount_ck CHECK (amount_ore > 0),
  CONSTRAINT order_refunds_status_ck CHECK (status IN ('pending', 'succeeded', 'failed')),
  CONSTRAINT order_refunds_idempotency_ck CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  CONSTRAINT order_refunds_selection_ck CHECK (jsonb_typeof(selection_json) = 'array'),
  CONSTRAINT order_refunds_failure_ck CHECK (failure_code IS NULL OR length(failure_code) <= 100),
  CONSTRAINT order_refunds_completion_ck CHECK (
    (status = 'pending' AND completed_at IS NULL)
    OR (status IN ('succeeded', 'failed') AND completed_at IS NOT NULL)
  ),
  UNIQUE (order_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS order_refunds_provider_id_uq
  ON public.order_refunds(provider, provider_refund_id)
  WHERE provider_refund_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_refunds_order_created_idx
  ON public.order_refunds(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_refunds_pending_idx
  ON public.order_refunds(updated_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.order_refund_items (
  refund_id uuid NOT NULL REFERENCES public.order_refunds(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
  quantity integer NOT NULL,
  amount_ore bigint NOT NULL,
  PRIMARY KEY (refund_id, order_item_id),
  CONSTRAINT order_refund_items_quantity_ck CHECK (quantity > 0),
  CONSTRAINT order_refund_items_amount_ck CHECK (amount_ore > 0)
);

CREATE INDEX IF NOT EXISTS order_refund_items_item_idx
  ON public.order_refund_items(order_item_id);

-- These tables may be installed after the repository-wide RLS migration on an
-- existing deployment, so protect them in this migration as well.
ALTER TABLE public.order_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_refunds FORCE ROW LEVEL SECURITY;
ALTER TABLE public.order_refund_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_refund_items FORCE ROW LEVEL SECURITY;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_refunded_amount_ck;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_refunded_amount_ck
    CHECK (refunded_amount_ore BETWEEN 0 AND total_ore) NOT VALID;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_refund_status_ck;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_refund_status_ck CHECK (
    refund_status IN ('none', 'pending', 'partially_refunded', 'refunded', 'failed')
  ) NOT VALID;

CREATE OR REPLACE FUNCTION public.reserve_order_refund(
  p_refund_id uuid,
  p_order_id uuid,
  p_admin_id text,
  p_idempotency_key text,
  p_items jsonb
)
RETURNS TABLE(
  refund_id uuid,
  amount_ore bigint,
  provider text,
  order_number text,
  stripe_checkout_session_id text,
  swish_instruction_id text,
  created boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_existing public.order_refunds%ROWTYPE;
  v_item record;
  v_selection jsonb;
  v_count integer;
  v_total bigint := 0;
  v_reserved integer;
  v_provider text;
BEGIN
  IF p_admin_id IS NULL OR length(trim(p_admin_id)) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'valid admin id is required' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 16 AND 128 THEN
    RAISE EXCEPTION 'valid idempotency key is required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'refund selection must contain 1 to 50 rows' USING ERRCODE = '22023';
  END IF;

  WITH requested AS (
    SELECT
      (entry->>'orderItemId')::uuid AS order_item_id,
      (entry->>'quantity')::integer AS quantity
    FROM jsonb_array_elements(p_items) AS entry
  )
  SELECT
    count(*),
    jsonb_agg(
      jsonb_build_object('orderItemId', order_item_id, 'quantity', quantity)
      ORDER BY order_item_id
    )
  INTO v_count, v_selection
  FROM requested;

  IF v_count <> (SELECT count(DISTINCT (entry->>'orderItemId')::uuid) FROM jsonb_array_elements(p_items) entry)
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_items) entry
       WHERE (entry->>'quantity')::integer <= 0
     ) THEN
    RAISE EXCEPTION 'refund rows must be unique with positive quantities' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_order FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  -- The order lock serializes both fresh reservations and replays. Re-checking
  -- idempotency only after acquiring it avoids a race where two identical
  -- requests both observed no existing row and one then hit the unique index.
  SELECT * INTO v_existing
  FROM public.order_refunds r
  WHERE r.order_id = p_order_id AND r.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.selection_json <> v_selection THEN
      RAISE EXCEPTION 'idempotency key was already used for another selection' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
      SELECT v_existing.id, v_existing.amount_ore, v_existing.provider,
             v_order.order_number, v_order.stripe_checkout_session_id,
             v_order.swish_instruction_id, false;
    RETURN;
  END IF;
  IF v_order.payment_status <> 'paid' OR v_order.payment_method NOT IN ('card', 'app', 'swish') THEN
    RAISE EXCEPTION 'order is not a paid refundable online order' USING ERRCODE = '22023';
  END IF;
  IF v_order.refund_status = 'refunded' OR v_order.refunded_amount_ore >= v_order.total_ore THEN
    RAISE EXCEPTION 'order is already fully refunded' USING ERRCODE = '22023';
  END IF;

  v_provider := CASE WHEN v_order.payment_method = 'swish' THEN 'swish' ELSE 'stripe' END;
  IF (v_provider = 'stripe' AND nullif(v_order.stripe_checkout_session_id, '') IS NULL)
     OR (v_provider = 'swish' AND nullif(v_order.swish_instruction_id, '') IS NULL) THEN
    RAISE EXCEPTION 'order is missing its provider payment reference' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT oi.id, oi.quantity, oi.price_ore, requested.requested_quantity
    FROM (
      SELECT
        (entry->>'orderItemId')::uuid AS order_item_id,
        (entry->>'quantity')::integer AS requested_quantity
      FROM jsonb_array_elements(p_items) AS entry
    ) requested
    JOIN public.order_items oi ON oi.id = requested.order_item_id
    WHERE oi.order_id = p_order_id
    ORDER BY oi.id
  LOOP
    SELECT COALESCE(sum(ri.quantity), 0)::integer INTO v_reserved
    FROM public.order_refund_items ri
    JOIN public.order_refunds r ON r.id = ri.refund_id
    WHERE ri.order_item_id = v_item.id AND r.status IN ('pending', 'succeeded');

    IF v_item.requested_quantity > v_item.quantity - v_reserved THEN
      RAISE EXCEPTION 'requested quantity exceeds remaining refundable quantity' USING ERRCODE = '22023';
    END IF;
    v_total := v_total + (v_item.requested_quantity * v_item.price_ore);
  END LOOP;

  IF (SELECT count(*) FROM public.order_items oi
      JOIN (
        SELECT (entry->>'orderItemId')::uuid AS id
        FROM jsonb_array_elements(p_items) entry
      ) requested ON requested.id = oi.id
      WHERE oi.order_id = p_order_id) <> v_count THEN
    RAISE EXCEPTION 'refund selection contains an item outside the order' USING ERRCODE = '22023';
  END IF;
  IF v_total <= 0 OR v_order.refunded_amount_ore + v_total > v_order.total_ore THEN
    RAISE EXCEPTION 'refund amount exceeds remaining paid amount' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.order_refunds (
    id, order_id, provider, amount_ore, idempotency_key,
    selection_json, requested_by_admin_id
  ) VALUES (
    p_refund_id, p_order_id, v_provider, v_total, p_idempotency_key,
    v_selection, trim(p_admin_id)
  );

  INSERT INTO public.order_refund_items (refund_id, order_item_id, quantity, amount_ore)
  SELECT
    p_refund_id,
    oi.id,
    requested.quantity,
    requested.quantity * oi.price_ore
  FROM (
    SELECT
      (entry->>'orderItemId')::uuid AS order_item_id,
      (entry->>'quantity')::integer AS quantity
    FROM jsonb_array_elements(p_items) entry
  ) requested
  JOIN public.order_items oi ON oi.id = requested.order_item_id
  WHERE oi.order_id = p_order_id;

  UPDATE public.orders
  SET refund_status = 'pending', updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.security_audit_log (
    event_id, actor_admin_id, action, resource_type, resource_id, outcome
  ) VALUES (
    gen_random_uuid(), trim(p_admin_id), 'provider_refund_reserved',
    'order', p_order_id::text, 'attempted'
  );

  RETURN QUERY SELECT p_refund_id, v_total, v_provider, v_order.order_number,
    v_order.stripe_checkout_session_id, v_order.swish_instruction_id, true;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_order_refund_provider_reference(
  p_refund_id uuid,
  p_provider_refund_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_provider_refund_id IS NULL OR length(trim(p_provider_refund_id)) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'valid provider refund id is required' USING ERRCODE = '22023';
  END IF;
  UPDATE public.order_refunds
  SET provider_refund_id = trim(p_provider_refund_id), updated_at = now()
  WHERE id = p_refund_id AND status = 'pending'
    AND (provider_refund_id IS NULL OR provider_refund_id = trim(p_provider_refund_id));
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_order_refund(
  p_refund_id uuid,
  p_succeeded boolean,
  p_failure_code text,
  p_completed_at timestamptz,
  p_event_id uuid
)
RETURNS TABLE(order_id uuid, refund_status text, order_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_refund public.order_refunds%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_succeeded_total bigint;
  v_pending_count integer;
  v_refund_status text;
  v_order_status text;
BEGIN
  SELECT * INTO v_refund FROM public.order_refunds r WHERE r.id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_order FROM public.orders o WHERE o.id = v_refund.order_id FOR UPDATE;

  IF v_refund.status <> 'pending' THEN
    IF (v_refund.status = 'succeeded') <> p_succeeded THEN
      RAISE EXCEPTION 'refund already finalized with another outcome' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT v_order.id, v_order.refund_status, v_order.status;
    RETURN;
  END IF;

  UPDATE public.order_refunds
  SET status = CASE WHEN p_succeeded THEN 'succeeded' ELSE 'failed' END,
      failure_code = CASE WHEN p_succeeded THEN NULL ELSE left(coalesce(p_failure_code, 'provider_failed'), 100) END,
      completed_at = p_completed_at,
      updated_at = p_completed_at
  WHERE id = p_refund_id;

  SELECT COALESCE(sum(r.amount_ore), 0) INTO v_succeeded_total
  FROM public.order_refunds r
  WHERE r.order_id = v_order.id AND r.status = 'succeeded';
  SELECT count(*) INTO v_pending_count
  FROM public.order_refunds r
  WHERE r.order_id = v_order.id AND r.status = 'pending';

  v_refund_status := CASE
    WHEN v_succeeded_total >= v_order.total_ore THEN 'refunded'
    WHEN v_pending_count > 0 THEN 'pending'
    WHEN v_succeeded_total > 0 THEN 'partially_refunded'
    ELSE 'failed'
  END;
  v_order_status := CASE
    WHEN v_refund_status = 'refunded'
      AND v_order.status IN ('ny', 'mottagen', 'påbörjad', 'klar') THEN 'avbruten'
    ELSE v_order.status
  END;

  UPDATE public.orders
  SET refunded_amount_ore = v_succeeded_total,
      refund_status = v_refund_status,
      status = v_order_status,
      cancelled_at = CASE
        WHEN v_order_status = 'avbruten' THEN coalesce(cancelled_at, p_completed_at)
        ELSE cancelled_at
      END,
      cancellation_reason = CASE
        WHEN v_order_status = 'avbruten' THEN coalesce(cancellation_reason, 'Full återbetalning')
        ELSE cancellation_reason
      END,
      updated_at = p_completed_at
  WHERE id = v_order.id;

  INSERT INTO public.security_audit_log (
    event_id, actor_admin_id, action, resource_type, resource_id, outcome
  ) VALUES (
    p_event_id,
    v_refund.requested_by_admin_id,
    v_refund.provider || '_refund_' || CASE WHEN p_succeeded THEN 'confirmed' ELSE 'failed' END,
    'order',
    v_order.id::text,
    CASE WHEN p_succeeded THEN 'succeeded' ELSE 'failed' END
  );

  RETURN QUERY SELECT v_order.id, v_refund_status, v_order_status;
END;
$$;

REVOKE ALL ON TABLE public.order_refunds, public.order_refund_items
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.order_refunds, public.order_refund_items
  FROM service_role;
GRANT SELECT ON TABLE public.order_refunds, public.order_refund_items TO service_role;

REVOKE ALL ON FUNCTION public.reserve_order_refund(uuid, uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_order_refund_provider_reference(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_order_refund(uuid, boolean, text, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_order_refund(uuid, uuid, text, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.set_order_refund_provider_reference(uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_order_refund(uuid, boolean, text, timestamptz, uuid)
  TO service_role;

COMMIT;
