-- Remove the manual feature only when its tables contain no records.
BEGIN;
SET LOCAL lock_timeout = '3s';
LOCK TABLE public.order_retention_holds, public.order_retention_runs IN ACCESS EXCLUSIVE MODE;
DO $check$
BEGIN
  IF EXISTS (SELECT 1 FROM public.order_retention_holds)
    OR EXISTS (SELECT 1 FROM public.order_retention_runs) THEN
    RAISE EXCEPTION 'Retention records exist. Stop and preserve them before removing the manual feature.';
  END IF;
END;
$check$;
DROP FUNCTION IF EXISTS public.apply_order_retention(text, jsonb, text[], text, text, boolean, date, boolean, timestamptz);
DROP TABLE public.order_retention_holds;
DROP TABLE public.order_retention_runs;
COMMIT;
