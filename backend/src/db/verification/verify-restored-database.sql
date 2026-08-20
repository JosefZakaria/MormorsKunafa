-- Read-only integrity report for an isolated disposable restore target.
-- It deliberately outputs aggregates and internal consistency counts, not PII.

BEGIN TRANSACTION READ ONLY;

WITH required_tables(table_name) AS (
  VALUES ('admin_settings'), ('admin_users'), ('order_items'), ('orders'), ('products')
)
SELECT bool_and(to_regclass('public.' || table_name) IS NOT NULL) AS core_tables_present
FROM required_tables
\gset

\if :core_tables_present
\else
  \echo 'One or more required core tables are missing from the restored database.'
  \quit 1
\endif

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
  count(*) FILTER (WHERE total_ore <= 0) AS nonpositive_order_totals,
  count(*) FILTER (WHERE payment_status = 'paid') AS paid_orders,
  coalesce(sum(total_ore) FILTER (WHERE payment_status = 'paid'), 0) AS paid_gross_ore,
  count(*) FILTER (
    WHERE order_type = 'eat-here'
      AND payment_status = 'paid'
      AND created_at >= timestamptz '2026-04-01 00:00:00 Europe/Stockholm'
  ) AS paid_eat_here_since_2026_04_01
FROM public.orders;

SELECT
  count(*) FILTER (WHERE quantity <= 0) AS nonpositive_item_quantities,
  count(*) FILTER (WHERE price_ore <= 0) AS nonpositive_item_prices,
  coalesce(sum(quantity::bigint * price_ore::bigint), 0) AS item_gross_ore
FROM public.order_items;

SELECT count(*) AS order_total_item_sum_mismatches
FROM public.orders AS orders
JOIN (
  SELECT order_id, sum(quantity::bigint * price_ore::bigint) AS item_total_ore
  FROM public.order_items
  GROUP BY order_id
) AS item_totals ON item_totals.order_id = orders.id
WHERE item_totals.item_total_ore <> orders.total_ore;

COMMIT;
