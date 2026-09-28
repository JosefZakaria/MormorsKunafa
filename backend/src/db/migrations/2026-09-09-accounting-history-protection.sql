-- Keep paid and operational order history available for receipts, VAT,
-- reconciliation and refunds. Only a still-new, unpaid checkout draft may be
-- physically removed by the separately guarded cleanup/reconciliation RPCs.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.reject_accounting_order_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status <> 'ny' OR OLD.payment_status <> 'pending' THEN
    RAISE EXCEPTION 'paid or operational order history cannot be deleted; anonymize eligible PII instead'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS protect_accounting_order_history ON public.orders;
CREATE TRIGGER protect_accounting_order_history
BEFORE DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.reject_accounting_order_delete();

REVOKE ALL ON FUNCTION public.reject_accounting_order_delete()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
