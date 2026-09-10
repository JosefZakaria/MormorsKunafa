-- Preserve receipt VAT after the verified-payment transition and prevent a
-- broad TRUNCATE from bypassing the row-level accounting deletion guard.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.protect_order_financial_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expected_rate smallint;
  v_expected_vat bigint;
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'order accounting history cannot be truncated'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.receipt_vat_rate_percent IS NOT DISTINCT FROM NEW.receipt_vat_rate_percent
     AND OLD.receipt_vat_ore IS NOT DISTINCT FROM NEW.receipt_vat_ore THEN
    RETURN NEW;
  END IF;

  v_expected_rate := CASE WHEN NEW.order_type = 'eat-here' THEN 12 ELSE 6 END;
  v_expected_vat := round(
    (NEW.total_ore::numeric * v_expected_rate) / (100 + v_expected_rate)
  )::bigint;

  -- The only ordinary write is the atomic pending -> paid transition. Legacy
  -- paid rows remain NULL until an accountant-approved forward correction.
  IF OLD.receipt_vat_rate_percent IS NULL
     AND OLD.receipt_vat_ore IS NULL
     AND OLD.payment_status = 'pending'
     AND NEW.payment_status = 'paid'
     AND NEW.total_ore IS NOT DISTINCT FROM OLD.total_ore
     AND NEW.order_type IS NOT DISTINCT FROM OLD.order_type
     AND NEW.receipt_vat_rate_percent = v_expected_rate
     AND NEW.receipt_vat_ore = v_expected_vat THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'verified receipt VAT history is immutable'
    USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS protect_order_receipt_vat_history ON public.orders;
CREATE TRIGGER protect_order_receipt_vat_history
BEFORE UPDATE OF receipt_vat_rate_percent, receipt_vat_ore ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.protect_order_financial_history();

DROP TRIGGER IF EXISTS protect_order_accounting_history_truncate ON public.orders;
CREATE TRIGGER protect_order_accounting_history_truncate
BEFORE TRUNCATE ON public.orders
FOR EACH STATEMENT
EXECUTE FUNCTION public.protect_order_financial_history();

COMMENT ON FUNCTION public.protect_order_financial_history() IS
  'Allows the verified-payment VAT snapshot once, rejects later VAT rewrites, and blocks order TRUNCATE';

COMMIT;
