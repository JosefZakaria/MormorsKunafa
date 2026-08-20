-- Read-only review of potentially affected eat-here sales after the Swedish
-- food VAT change on 2026-04-01. Run privately and give the result to the
-- accounting adviser only if rows exist. It returns no customer contact data.

BEGIN TRANSACTION READ ONLY;

WITH payment_events AS (
  SELECT resource_id AS order_id, min(created_at) AS verified_paid_at
  FROM public.security_audit_log
  WHERE resource_type = 'order'
    AND action IN ('stripe_payment_confirmed', 'swish_payment_confirmed', 'online_payment_confirmed')
    AND outcome = 'succeeded'
  GROUP BY resource_id
), affected AS (
  SELECT
    orders.id,
    orders.order_number,
    orders.payment_method,
    orders.payment_status,
    orders.total_ore,
    coalesce(payment_events.verified_paid_at, orders.updated_at, orders.created_at) AS accounting_time,
    round((orders.total_ore::numeric * 12) / 112)::bigint AS expected_included_vat_ore
  FROM public.orders AS orders
  LEFT JOIN payment_events ON payment_events.order_id = orders.id::text
  WHERE orders.order_type = 'eat-here'
    AND orders.payment_status = 'paid'
    AND coalesce(payment_events.verified_paid_at, orders.updated_at, orders.created_at)
      >= timestamptz '2026-04-01 00:00:00 Europe/Stockholm'
)
SELECT
  count(*) AS affected_paid_eat_here_orders,
  coalesce(sum(total_ore), 0) AS gross_ore,
  coalesce(sum(expected_included_vat_ore), 0) AS expected_included_vat_ore_12_percent,
  min(accounting_time) AS first_affected_time,
  max(accounting_time) AS last_affected_time
FROM affected;

WITH payment_events AS (
  SELECT resource_id AS order_id, min(created_at) AS verified_paid_at
  FROM public.security_audit_log
  WHERE resource_type = 'order'
    AND action IN ('stripe_payment_confirmed', 'swish_payment_confirmed', 'online_payment_confirmed')
    AND outcome = 'succeeded'
  GROUP BY resource_id
), affected AS (
  SELECT
    orders.order_number,
    orders.payment_method,
    orders.total_ore,
    coalesce(payment_events.verified_paid_at, orders.updated_at, orders.created_at) AS accounting_time,
    round((orders.total_ore::numeric * 12) / 112)::bigint AS expected_included_vat_ore
  FROM public.orders AS orders
  LEFT JOIN payment_events ON payment_events.order_id = orders.id::text
  WHERE orders.order_type = 'eat-here'
    AND orders.payment_status = 'paid'
    AND coalesce(payment_events.verified_paid_at, orders.updated_at, orders.created_at)
      >= timestamptz '2026-04-01 00:00:00 Europe/Stockholm'
)
SELECT
  order_number,
  payment_method,
  total_ore,
  expected_included_vat_ore,
  accounting_time
FROM affected
ORDER BY accounting_time, order_number;

COMMIT;
