# Supabase/PostgreSQL migrations

These SQL files are versioned deployment artifacts. The application never
applies them automatically and local builds/tests do not connect to production.

Use `migration-order.json` only for an empty/fresh installation. An existing
main database must use the phased `legacy-transition-order.json`; see
[`Docs/LEGACY_CHECKOUT_TRANSITION.md`](../../../../Docs/LEGACY_CHECKOUT_TRANSITION.md).
Compare the real database's applied-migration ledger and checksums first; execute
only pending migrations from the selected track. The local harness ledger is
synthetic evidence, not a copy of production. Never falsify the ledger, rerun a
changed migration or rerun old sequence/role initializers.
Take a backup, use a staging database first, and keep the matching backend deploy
paused until the migration has committed successfully.

The legacy Phase 1 bridge is additive and keeps the shop writer-compatible: a
table-then-sequence lock seeds one trigger used by both old `MAX` inserts and the
new RPC. The original atomic and checkout-rollout files stay immutable and are
excluded from the existing-main track. Phase 4 uses the complementary checkout
finalization only after old processes and aliases are proven drained. Its index
is concurrent; its short metadata/sequence transaction uses the same lock order
as trigger-backed inserts and aborts after five seconds of lock contention.
No shop pause is authorized by this document.

`2026-09-08-unsettled-payment-retention.sql` preserves the existing retention RPC
signatures and periods. Unresolved online payments, pending refunds, legal holds
and non-terminal fulfillment retain their evidence. Bounded initiated-payment
listing rotates inconclusive attempts instead of repeatedly starving later rows;
listing never authorizes deletion. Provider identity and terminal unpaid state
must still be verified before the conditional delete RPC is called.

### Free-plan backup and restore gate

Supabase Free does not provide customer-accessible daily backups. Before any
production migration, set `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`,
`PGPASSWORD` and `PGSSLMODE=require` in the operator's private shell and run
`scripts/New-SupabaseSafetyBackup.ps1`. The destination must be encrypted,
access-restricted and outside both Git and ordinary cloud-synced folders. The
script creates a custom-format archive plus a SHA-256 manifest and rejects an
archive missing the core accounting/order tables.

Both operator scripts capture one validated connection and remove every inherited
`PG*` override while their commands run, restoring the original environment on
exit. Host/port lists, socket hosts and connection-string database values are
rejected. Database names are compared case-sensitively. Optional TLS certificate,
key, root certificate and CRL settings use the corresponding `PGSSL*` variables;
restore settings must use the `RESTORE_` prefix. `PGSERVICE`, `PGHOSTADDR`,
`PGOPTIONS` and passfile overrides are never inherited. Prefer `verify-full`
with a trusted root certificate for remote connections; the default is `require`.
Use `disable` only for the explicitly isolated local test cluster.

Restore that exact archive into a separate disposable PostgreSQL database with
`scripts/Test-SupabaseBackupRestore.ps1`. Restore credentials use the
`RESTORE_PG*` environment-variable prefix. The script rejects the source host,
requires the exact disposable database name, uses a single transaction and runs
`../verification/verify-restored-database.sql`. Never use production as the
restore target. Retain only the manifest, timestamps, aggregate verification
result and operator approval in the restricted migration journal.

Retake archives whose manifests predate format version 2: their claimed source
may have been affected by inherited connection overrides. Host fingerprints and
database/user checks verify the declared connection, not physical separation
against DNS aliases, tunnels or an incorrectly selected project. Independently
verify the disposable server/project and credentials before approving a restore.
The read-only verification SQL raises an error for inconsistent totals, missing
items, orphaned items, duplicate order numbers, and null/nonpositive amounts or
quantities; printed aggregate counts alone never establish success.

Once an explicit compatible cutover strategy is approved, take and restore-test
a fresh archive and record the last accepted order number and paid gross
aggregate at its defined boundary. Keep incompatible writers from overlapping.
After migration, run both read-only verification files and reconcile intervening
payments before enabling the new writer. A failed check requires a forward fix
or compatible-build recovery review, not deletion of live rows or restoring an
old full backup over new orders and payments.

For the historical eat-here VAT question, run
`../verification/review-eat-here-accounting.sql` privately. If its first count
is zero, record that no paid eat-here order was found from 2026-04-01 onward. If
rows exist, give the non-PII order-number report and original receipts to the
accounting adviser; the query is evidence collection, not an accounting ruling.
The report also identifies paid rows without the new receipt VAT snapshot and
stored snapshots that differ from the current application formula. Do not infer
or backfill historical VAT from today's code.

## 2026-08-19 atomic order creation (fresh installations only)

Do not apply `2026-08-19-atomic-order-creation.sql` to the live legacy track. It
adds constraints that reject main's transient zero-total parent. For a fresh
installation, verify that no duplicate order numbers exist:

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
The same migration stores only a SHA-256 hash of each customer status token.
New tokens last seven days, or through a validated preorder plus seven days
(with a bounded booking horizon). Existing token expiry is not silently extended.
Revocation clears that hash; existing legacy tokens intentionally stop
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

Apply `2026-08-19-initiated-checkout-reconciliation.sql` before enabling the
cron. It exposes only order ID, payment method, total and provider identifiers;
customer PII is never returned to the reconciliation worker. The worker fetches
the canonical provider object and validates every immutable field. It marks an
exact paid match as paid, deletes only Stripe `expired` + `unpaid` sessions or
exact terminal unpaid Swish payments, and retains open, unknown or mismatched
records for a later run. The final delete repeats the age, status, payment method
and provider-reference checks atomically so a concurrently paid order survives.

Provider availability failures are counted and retried by the next daily run.
After staging deployment, create abandoned Stripe and Swish test payments and
verify the cron both preserves paid/open attempts and deletes terminal unpaid
attempts after the 24-hour cutoff.

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

## 2026-08-19 operational order PII retention

Apply `2026-08-19-operational-pii-retention.sql` after the immutable audit
migration. It adds an explicit legal-hold flag and two service-role-only RPCs.
Neither the migration nor the daily checkout cleanup schedules fulfilled-order
anonymization automatically. The 90- and 1,095-day cutoffs are current technical
minimums only; they are not evidence that the periods or selected fields have
owner, privacy or accounting approval. Start any future review in dry-run mode:

```json
{"scope":"operational_details","limit":100,"dryRun":true}
```

This scope removes delivery data, internal/cancellation free text, customer
status credentials and item modifications after 90 days. After reviewing and
executing it, separately preview the three-year contact pass:

```json
{"scope":"customer_contact","limit":100,"dryRun":true}
```

Review every returned order ID and number without exporting customer data. Set
`operational_pii_legal_hold = true` for disputes, active rights requests,
incidents or other documented holds. Only then repeat the exact request with
`"dryRun":false`. The contact pass anonymizes name, phone and email after 1,095
days and also catches any older operational details missed by the shorter pass.
Both scopes preserve financial and provider records and append one immutable
audit event per changed order.

Run small batches, retain only counts and non-secret execution metadata, and do
not execute a mutation or add this endpoint to Vercel Cron until the field-level
preservation matrix, interval and named owner have been independently approved
and recorded in the restricted operations journal. See
[`Docs/ACCOUNTING_DATA_PRESERVATION.md`](../../../../Docs/ACCOUNTING_DATA_PRESERVATION.md)
and
[`Docs/EXTERNAL_RELEASE_VERIFICATION.md`](../../../../Docs/EXTERNAL_RELEASE_VERIFICATION.md).

## 2026-09-09 accounting history protection

Apply `2026-09-09-accounting-history-protection.sql` after unsettled-payment
retention and before the receipt VAT snapshot. It blocks physical deletion of
every order except a `ny`/`pending` draft, including when called through the
service role. Existing provider-aware abandoned-checkout functions remain the
only intended application deletion path and repeat their stricter age,
provider-state and refund checks atomically.

The admin UI exposes no history deletion action. Compatibility endpoints return
HTTP 409 rather than deleting a row. This is a safety boundary, not a complete
bookkeeping archive: the owner/accountant still must identify the authoritative
copy, retention schedule and access/export procedure.

## 2026-09-09 receipt VAT snapshot

Apply `2026-09-09-receipt-vat-snapshot.sql` after accounting history protection
and before checkout finalization. It adds nullable receipt VAT rate/amount fields
and replaces the existing paid-transition RPC without changing its signature.
For a newly verified payment, the current application calculation and immutable
payment audit are stored in the same transaction. Receipt renderers prefer the
snapshot so later code changes cannot silently rewrite that displayed history.

Existing paid rows deliberately remain null. The migration performs no guessed
backfill, and the current 6%/12% application formula is not an accounting ruling.
Review legacy rows and legal edge cases from original receipts with an accountant
before any correction.

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

## 2026-08-19 duplicate Stripe refunds

Apply `2026-08-19-duplicate-stripe-refunds.sql` after the Stripe event,
immutable audit and provider-refund migrations, and before deploying the
matching backend. It creates a separate ledger for a verified second paid
Checkout Session. It deliberately does not change item allocations, the
original order's refunded amount or its fulfillment status.

The reservation function accepts only an already-processed
`alert_paid_session_validation_failed` event tied to the same already-paid
card order. The backend additionally retrieves the canonical Stripe event and
session and requires an exact order, amount, currency and payment-mode match
with a session ID different from the stored original. Test the three-step admin
confirmation in Stripe test mode before enabling this operation in production.
