-- Capture the VAT values actually used when a payment becomes verified. Older
-- paid orders remain NULL: their historical treatment must be reviewed from
-- original receipts/accounting evidence rather than guessed by a migration.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS receipt_vat_rate_percent smallint,
  ADD COLUMN IF NOT EXISTS receipt_vat_ore bigint;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_receipt_vat_snapshot_ck;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_receipt_vat_snapshot_ck CHECK (
    (receipt_vat_rate_percent IS NULL AND receipt_vat_ore IS NULL)
    OR (
      receipt_vat_rate_percent IN (6, 12)
      AND receipt_vat_ore BETWEEN 0 AND total_ore
    )
  ) NOT VALID;

COMMENT ON COLUMN public.orders.receipt_vat_rate_percent IS
  'VAT rate captured by the verified payment transition; NULL means legacy/unreviewed';
COMMENT ON COLUMN public.orders.receipt_vat_ore IS
  'Included VAT amount captured by the verified payment transition; NULL means legacy/unreviewed';

CREATE OR REPLACE FUNCTION public.mark_order_paid_with_audit(
  p_order_id uuid,
  p_paid_at timestamptz,
  p_event_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment_method text;
BEGIN
  UPDATE public.orders
  SET
    payment_status = 'paid',
    updated_at = p_paid_at,
    receipt_vat_rate_percent = CASE WHEN order_type = 'eat-here' THEN 12 ELSE 6 END,
    receipt_vat_ore = round(
      (total_ore::numeric * CASE WHEN order_type = 'eat-here' THEN 12 ELSE 6 END)
      / (100 + CASE WHEN order_type = 'eat-here' THEN 12 ELSE 6 END)
    )::bigint
  WHERE id = p_order_id
    AND payment_status = 'pending'
  RETURNING payment_method INTO v_payment_method;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.security_audit_log (
    event_id,
    action,
    resource_type,
    resource_id,
    outcome
  ) VALUES (
    p_event_id,
    CASE v_payment_method
      WHEN 'card' THEN 'stripe_payment_confirmed'
      WHEN 'swish' THEN 'swish_payment_confirmed'
      ELSE 'online_payment_confirmed'
    END,
    'order',
    p_order_id::text,
    'succeeded'
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_order_paid_with_audit(uuid, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_paid_with_audit(uuid, timestamptz, uuid)
  TO service_role;

COMMIT;
