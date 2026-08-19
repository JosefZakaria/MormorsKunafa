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
  VALIDATE CONSTRAINT orders_payment_status_ck,
  VALIDATE CONSTRAINT orders_status_token_ck;

ALTER TABLE public.order_items
  VALIDATE CONSTRAINT order_items_quantity_ck,
  VALIDATE CONSTRAINT order_items_price_positive_ck;
```

Smoke-test a complete checkout in staging. If the function is missing, the new
backend intentionally fails closed instead of returning a partially saved order.
The same migration stores only a SHA-256 hash of each seven-day customer status
token. Revocation clears that hash; existing legacy tokens intentionally stop
working after deployment.

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

## 2026-08-19 abandoned checkout cleanup

Apply `2026-08-19-abandoned-checkout-cleanup.sql` before enabling the matching
daily Vercel cron. The function refuses cutoffs newer than 24 hours and deletes
at most 500 rows per transaction using `SKIP LOCKED`. A 24-hour cutoff combined
with the daily schedule removes eligible drafts after 24–48 hours.

It only removes `pending` online-payment drafts that have neither a Stripe
Checkout Session ID nor a Swish instruction ID. This is intentional: initiated
payments must be checked with the provider before they can be safely removed.

## 2026-08-19 immutable security audit

Apply `2026-08-19-immutable-security-audit.sql` before deploying the matching
backend. Database triggers reject updates, deletes and truncation, including
through the service-role client. The application records route templates and
internal resource IDs, never request bodies; login email is HMAC-hashed.

Authenticated admin requests fail closed if the audit write fails. Establish a
documented retention/export process before the table approaches storage limits.
The same migration makes each successful `pending` to `paid` transition and its
provider-specific audit event one database transaction. A failed audit insert
therefore cannot leave an unaudited paid order.

## 2026-08-19 structured food information

Apply `2026-08-19-structured-food-information.sql` before deploying the matching
product API. It adds a closed list of the 14 regulated allergen categories and a
structured ingredient list. The API exposes these fields only after
`food_information_verified_at` and `food_information_verified_by` are set.

Do not mark a product verified from marketing copy. Reconcile every ingredient,
allergen and trace warning with the current recipe, supplier label and kitchen
cross-contamination procedure first. Prepacked products may require additional
mandatory fields beyond this initial structure.

## 2026-08-19 row-level security

Apply `2026-08-19-row-level-security.sql` last. It fails closed if any expected
table is absent, enables and forces RLS, and removes direct `anon` and
`authenticated` access. The application currently serves all product, order and
admin data through the backend's service-role client; no browser or mobile code
should query Supabase tables directly.

Before applying it, confirm that the backend is configured with a service-role
key rather than an anonymous key. Afterwards, run the read-only checks in
`../verification/verify-security-posture.sql`. Do not treat a local SQL review
as production verification: save the staging and production results with the
deployment record.

Any future direct Supabase client access requires a separate, narrowly scoped
policy and a security review. Do not add a broad `USING (true)` policy to make a
failing client work.

## 2026-08-19 provider refunds

Apply `2026-08-19-provider-refunds.sql` only after the immutable audit migration
and before deploying the matching backend. The migration creates a persistent
allocation ledger and database functions that serialize refund reservations per
order. A pending reservation counts against the remaining refundable quantity;
this prevents two admin requests from refunding the same item concurrently.

Before applying it, verify that paid online orders have the provider reference
needed to issue a refund. Investigate every returned row rather than fabricating
or copying a provider identifier:

```sql
SELECT id, order_number, payment_method
FROM public.orders
WHERE payment_status = 'paid'
  AND (
    (payment_method IN ('card', 'app') AND stripe_checkout_session_id IS NULL)
    OR (payment_method = 'swish' AND swish_instruction_id IS NULL)
  );
```

After staging deployment, test partial and full refunds with provider test
payments, duplicate submissions and a simulated callback retry. Confirm that
the sum of succeeded refunds never exceeds `orders.total_ore` and that each
refund has matching immutable security-audit entries.

Validate the two new order constraints after the migration and before recording
the deployment as verified:

```sql
ALTER TABLE public.orders
  VALIDATE CONSTRAINT orders_refunded_amount_ck,
  VALIDATE CONSTRAINT orders_refund_status_ck;
```

Set `REFUND_PASSWORD_HASH` to a bcrypt hash with cost 10 or higher. Keep the
plaintext password outside Git and deployment configuration. Stripe's signed
webhook must subscribe to `refund.created`, `refund.updated` and `refund.failed`
in addition to `checkout.session.completed`; Swish continues to use the verified
mTLS callback endpoint.
