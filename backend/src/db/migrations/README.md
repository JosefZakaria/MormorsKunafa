# Supabase/PostgreSQL migrations

These SQL files are versioned deployment artifacts. The application never
applies them automatically and local builds/tests do not connect to production.

Apply migrations in filename order in a controlled Supabase maintenance window.
Take a backup, use a staging database first, and keep the matching backend deploy
paused until the migration has committed successfully.

## 2026-08-19 atomic order creation

Before applying `2026-08-19-atomic-order-creation.sql`, verify that no duplicate
order numbers exist:

```sql
SELECT order_number, count(*)
FROM public.orders
GROUP BY order_number
HAVING count(*) > 1;
```

After applying it, clean any historical invalid data before validating the
`NOT VALID` constraints. These preflight queries must each return zero rows:

```sql
SELECT id FROM public.orders
WHERE total_ore <= 0
   OR default_preparation_time_minutes NOT BETWEEN 1 AND 1440
   OR status NOT IN ('ny', 'mottagen', 'påbörjad', 'klar', 'avbruten', 'uthämtad', 'levererad')
   OR order_type NOT IN ('eat-here', 'takeaway', 'delivery')
   OR payment_method NOT IN ('card', 'swish', 'cash', 'app')
   OR payment_status NOT IN ('pending', 'paid');

SELECT id FROM public.order_items
WHERE quantity NOT BETWEEN 1 AND 50 OR price_ore <= 0;
```

Then validate the constraints explicitly:

```sql
ALTER TABLE public.orders
  VALIDATE CONSTRAINT orders_total_positive_ck,
  VALIDATE CONSTRAINT orders_prep_time_ck,
  VALIDATE CONSTRAINT orders_status_ck,
  VALIDATE CONSTRAINT orders_type_ck,
  VALIDATE CONSTRAINT orders_payment_method_ck,
  VALIDATE CONSTRAINT orders_payment_status_ck;

ALTER TABLE public.order_items
  VALIDATE CONSTRAINT order_items_quantity_ck,
  VALIDATE CONSTRAINT order_items_price_positive_ck;
```

Smoke-test a complete checkout in staging. If the function is missing, the new
backend intentionally fails closed instead of returning a partially saved order.

## 2026-08-19 admin session revocation

Apply `2026-08-19-admin-session-revocation.sql` before deploying the matching
backend. Existing admins remain active and receive `token_version = 1`. Existing
JWTs intentionally stop working because they do not contain a token version;
admins must sign in again.

Setting `is_active = false` immediately blocks an account. Incrementing an
admin's `token_version` revokes every token issued at an older version:

```sql
UPDATE public.admin_users
SET token_version = token_version + 1
WHERE id = '<verified-admin-id>';
```

Use the application's logout endpoint for ordinary revocation. Only use the SQL
form during an incident after independently verifying the intended admin ID.

## 2026-08-19 Stripe event idempotency

Apply `2026-08-19-stripe-event-idempotency.sql` before deploying the matching
webhook code. It stores only provider event metadata, processing state and the
internal order ID; it does not persist Stripe payloads or customer details.

The five-minute lease lets a later Stripe retry recover an event after a crashed
worker. Monitor failed or repeatedly attempted events without logging payloads:

```sql
SELECT event_id, event_type, outcome, attempts, received_at
FROM public.payment_provider_events
WHERE provider = 'stripe' AND (status = 'failed' OR attempts > 1)
ORDER BY received_at DESC;
```
