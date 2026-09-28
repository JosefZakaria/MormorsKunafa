-- Current delivery pricing permits zero. Keep product rows strictly positive.
-- Preserve old rows without scanning or rewriting accounting history.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_price_positive_ck;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_price_positive_ck CHECK (
  price_ore > 0 OR (
    price_ore = 0 AND product_id IS NULL
    AND product_name_snapshot = 'Leveransavgift' AND quantity = 1
  )
) NOT VALID;
COMMIT;
