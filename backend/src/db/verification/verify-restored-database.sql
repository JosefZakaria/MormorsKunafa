-- Read-only integrity report for an isolated disposable restore target.
-- It deliberately outputs aggregates and internal consistency counts, not PII.

\if :{?expected_accounting_profile}
\else
  \set expected_accounting_profile legacy-core
\endif

BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = pg_catalog;

SELECT
  :'expected_accounting_profile' IN ('legacy-core', 'secured-ledgers')
    AS accounting_profile_valid,
  1 / (:'expected_accounting_profile' IN ('legacy-core', 'secured-ledgers'))::integer
    AS accounting_profile_guard;

WITH required_tables(table_name) AS (
  VALUES ('admin_settings'), ('admin_users'), ('order_items'), ('orders'), ('products')
), core_check AS (
  SELECT bool_and(to_regclass('public.' || table_name) IS NOT NULL) AS present
  FROM required_tables
)
SELECT present AS core_tables_present,
  1 / present::integer AS core_tables_guard
FROM core_check;

WITH secured_ledger_tables(table_name) AS (
  VALUES
    ('duplicate_stripe_refunds'),
    ('order_refund_items'),
    ('order_refunds'),
    ('payment_provider_events'),
    ('security_audit_log')
)
SELECT count(*) FILTER (WHERE to_regclass('public.' || table_name) IS NOT NULL)
  AS secured_ledger_tables_present
FROM secured_ledger_tables;

WITH secured_ledger_tables(table_name) AS (
  VALUES
    ('duplicate_stripe_refunds'),
    ('order_refund_items'),
    ('order_refunds'),
    ('payment_provider_events'),
    ('security_audit_log')
), profile_check AS (
  SELECT CASE :'expected_accounting_profile'
    WHEN 'legacy-core' THEN count(*) FILTER (
      WHERE to_regclass('public.' || table_name) IS NOT NULL
    ) = 0
    WHEN 'secured-ledgers' THEN count(*) FILTER (
      WHERE to_regclass('public.' || table_name) IS NOT NULL
    ) = count(*)
    ELSE false
  END AS matches
  FROM secured_ledger_tables
)
SELECT matches AS accounting_profile_matches,
  1 / matches::integer AS accounting_profile_guard
FROM profile_check;

SELECT
  (SELECT count(*) FROM public.orders) AS order_rows,
  (SELECT count(*) FROM public.order_items) AS order_item_rows,
  (SELECT count(*) FROM public.products) AS product_rows,
  (SELECT count(*) FROM public.admin_users) AS admin_rows;

SELECT count(*) AS orphan_order_items
FROM public.order_items AS items
LEFT JOIN public.orders AS orders ON orders.id = items.order_id
WHERE orders.id IS NULL;

SELECT count(*) AS duplicate_order_numbers
FROM (
  SELECT order_number
  FROM public.orders
  GROUP BY order_number
  HAVING count(*) > 1
) AS duplicates;

SELECT
  count(*) FILTER (WHERE total_ore IS NULL OR total_ore <= 0) AS invalid_order_totals,
  count(*) FILTER (WHERE payment_status = 'paid') AS paid_orders,
  coalesce(sum(total_ore) FILTER (WHERE payment_status = 'paid'), 0) AS paid_gross_ore,
  count(*) FILTER (
    WHERE order_type = 'eat-here'
      AND payment_status = 'paid'
      AND created_at >= timestamptz '2026-04-01 00:00:00 Europe/Stockholm'
  ) AS paid_eat_here_since_2026_04_01
FROM public.orders;

SELECT
  count(*) FILTER (WHERE quantity IS NULL OR quantity <= 0) AS invalid_item_quantities,
  count(*) FILTER (WHERE price_ore IS NULL OR price_ore <= 0) AS invalid_item_prices,
  coalesce(sum(quantity::bigint * price_ore::bigint), 0) AS item_gross_ore
FROM public.order_items;

SELECT count(*) AS order_total_item_sum_mismatches
FROM public.orders AS orders
LEFT JOIN (
  SELECT order_id, sum(quantity::bigint * price_ore::bigint) AS item_total_ore
  FROM public.order_items
  GROUP BY order_id
) AS item_totals ON item_totals.order_id = orders.id
WHERE item_totals.item_total_ore IS DISTINCT FROM orders.total_ore;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.order_items i LEFT JOIN public.orders o ON o.id=i.order_id WHERE o.id IS NULL)
    OR EXISTS (SELECT 1 FROM public.orders GROUP BY order_number HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM public.orders WHERE order_number IS NULL OR total_ore IS NULL OR total_ore <= 0)
    OR EXISTS (SELECT 1 FROM public.order_items WHERE quantity IS NULL OR quantity <= 0 OR price_ore IS NULL OR price_ore <= 0)
    OR EXISTS (SELECT 1 FROM public.orders o LEFT JOIN (
      SELECT order_id,sum(quantity::bigint*price_ore::bigint) AS total FROM public.order_items GROUP BY order_id
    ) i ON i.order_id=o.id WHERE i.total IS DISTINCT FROM o.total_ore OR i.order_id IS NULL) THEN
    RAISE EXCEPTION 'Restored data failed order/accounting integrity verification';
  END IF;
END;
$$;

SELECT :'expected_accounting_profile' = 'secured-ledgers'
  AS verify_secured_ledgers
\gset

\if :verify_secured_ledgers
  WITH receipt_columns AS (
    SELECT count(*) = 2 AS present
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.orders'::regclass
      AND attname IN ('receipt_vat_rate_percent', 'receipt_vat_ore')
      AND attnum > 0
      AND NOT attisdropped
  )
  SELECT present AS receipt_vat_columns_present,
    1 / present::integer AS receipt_vat_columns_guard
  FROM receipt_columns;

  SELECT
    (SELECT count(*) FROM public.payment_provider_events) AS payment_event_rows,
    (SELECT count(*) FROM public.security_audit_log) AS security_audit_rows,
    (SELECT count(*) FROM public.order_refunds) AS refund_rows,
    (SELECT count(*) FROM public.order_refund_items) AS refund_item_rows,
    (SELECT count(*) FROM public.duplicate_stripe_refunds) AS duplicate_refund_rows;

  SELECT
    (SELECT count(*) FROM public.order_refunds r
      LEFT JOIN public.orders o ON o.id = r.order_id
      WHERE o.id IS NULL) AS orphan_refunds,
    (SELECT count(*) FROM public.order_refund_items ri
      LEFT JOIN public.order_refunds r ON r.id = ri.refund_id
      WHERE r.id IS NULL) AS orphan_refund_ledger_rows,
    (SELECT count(*) FROM public.order_refund_items ri
      LEFT JOIN public.order_items oi ON oi.id = ri.order_item_id
      WHERE oi.id IS NULL) AS orphan_refund_order_items,
    (SELECT count(*) FROM public.duplicate_stripe_refunds r
      LEFT JOIN public.orders o ON o.id = r.order_id
      WHERE o.id IS NULL) AS orphan_duplicate_refunds;

  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM public.order_refunds r
      LEFT JOIN public.orders o ON o.id = r.order_id
      WHERE o.id IS NULL
    ) OR EXISTS (
      SELECT 1 FROM public.order_refund_items ri
      LEFT JOIN public.order_refunds r ON r.id = ri.refund_id
      WHERE r.id IS NULL
    ) OR EXISTS (
      SELECT 1 FROM public.order_refund_items ri
      LEFT JOIN public.order_items oi ON oi.id = ri.order_item_id
      WHERE oi.id IS NULL
    ) OR EXISTS (
      SELECT 1 FROM public.order_refund_items ri
      JOIN public.order_refunds r ON r.id = ri.refund_id
      JOIN public.order_items oi ON oi.id = ri.order_item_id
      WHERE oi.order_id <> r.order_id
    ) OR EXISTS (
      SELECT 1 FROM public.duplicate_stripe_refunds r
      LEFT JOIN public.orders o ON o.id = r.order_id
      WHERE o.id IS NULL
    ) OR EXISTS (
      SELECT 1 FROM public.orders
      WHERE (receipt_vat_rate_percent IS NULL) <> (receipt_vat_ore IS NULL)
        OR (receipt_vat_rate_percent IS NOT NULL AND (
          receipt_vat_rate_percent <> CASE WHEN order_type = 'eat-here' THEN 12 ELSE 6 END
          OR receipt_vat_ore <> round(
            (total_ore::numeric * CASE WHEN order_type = 'eat-here' THEN 12 ELSE 6 END)
            / (100 + CASE WHEN order_type = 'eat-here' THEN 12 ELSE 6 END)
          )::bigint
        ))
    ) THEN
      RAISE EXCEPTION 'Restored secured ledgers failed financial-history integrity verification';
    END IF;
  END;
  $$;
\endif

COMMIT;
