# Legacy checkout transition

Status 2026-09-09: locally implemented and tested rollout contract. No hosted
database, Vercel project, provider account, deployment or production alias was
changed or inspected.

The locked `origin/main` backend writes an order in three separate operations:
it calculates `MAX(order_number) + 1`, inserts the parent with `total_ore = 0`,
then inserts items and updates the total. The secured backend uses an atomic RPC,
server pricing, an idempotency key and an order-status capability. These writers
must not be mixed without the database bridge below.

## Choose the migration track from evidence

`migration-order.json` is only the **empty/fresh-install** track. An existing
main database must use `legacy-transition-order.json` and its explicit phase
arrays. Compare the real migration ledger and SHA-256 checksums first. Never
edit the ledger, pretend a skipped migration ran, or rerun a file whose recorded
checksum differs.

Stop the rollout if `orders_total_positive_ck` or the original atomic-order
migration is already active while a legacy backend still accepts orders. The
bridge intentionally refuses this state instead of silently weakening an active
constraint. Investigate the actual writers, aliases, partial rows and ledger and
prepare a separately reviewed forward repair.

Before Phase 1, take an access-restricted backup and restore-test it in an
independently isolated database. Record, without customer data:

- the last stored numeric order number and sequence state, if any;
- counts of zero/nonpositive totals, orders without items and duplicate numbers;
- paid gross and unsettled Stripe/Swish/refund/provider-event aggregates;
- every backend deployment and alias that can still write the database.

Do not delete or rewrite a financial/order row merely to make a check pass.

## Phase 1 — shared database allocation

Apply `phase1DatabaseBridge` in the exact order in
`legacy-transition-order.json`. The first complementary migration takes a
five-second bounded table lock, seeds a non-cycling sequence above all stored
numeric display numbers and installs a `BEFORE INSERT` allocator. Both a stale
legacy `MAX` value and the atomic RPC are then replaced by the trigger's stored
number; the RPC reads that number with `INSERT ... RETURNING`.

This phase deliberately permits the legacy parent insert with `total_ore = 0`.
The new API still rejects invalid totals and quantities before calling the RPC.
Historical or newly interrupted legacy parents remain visible for explicit
reconciliation. Offline restore/import work must run in an isolated database:
the live allocator may replace supplied numeric display numbers.

After Phase 1, prove on the isolated restore and then on the authorized target:

1. old `MAX` and new RPC calls running concurrently store unique numbers;
2. the number returned by the RPC equals the number stored on the order;
3. existing order IDs, numbers, items, provider references and paid aggregates
   are unchanged;
4. the allocator trigger is enabled and only `service_role` can execute the RPC
   or use the sequence.

If the five-second lock cannot be acquired, the migration aborts. Do not extend
the timeout blindly; measure and retry only under an approved operator plan.

## Phase 2 — web bridge before backend

Deploy the reviewed web build while the old backend remains active. Its create
request retains the legacy composite product ID/name/price fields but also sends
`X-Checkout-Contract: order-v2` and an idempotency key. Old main ignores the new headers;
the new backend ignores client price/name and resolves the composite ID against
its own catalogue. There is no health/capability preflight and no weaker request
chosen from a cached response.

The create response is the only transition signal. The exact `order-v2`
response marker together with a structurally valid status capability means the
new contract; absence of both means that the already-created order belongs to
the legacy flow. A partial or unfamiliar signal is ambiguous and never starts a
payment. Before the create request, the browser records a non-PII random key and
timestamp in `pending-checkout-create`. It replaces that marker with the order
ID, payment method, contract class, start flag and timestamp in
`pending-checkout-order` only after validating the response. A lost create
response therefore blocks another create after reload. The pre-create marker is
cleared without an order only for the backend's explicit 426 pre-write upgrade
rejection. If legacy payment initiation has an ambiguous/lost response, it also
cannot be resubmitted. Both ambiguous paths show the staffed
contact/reconciliation message instead.

## Phase 3 — guarded backend and drain

Deploy the new backend only after the bridge web is the active Production web
artifact. The backend requires the exact checkout-contract header before rate
limits, idempotency storage, database access or provider calls on customer
purchase mutations. A missing or wrong value returns HTTP 426 with stable code
`CLIENT_UPGRADE_REQUIRED` and asks the customer to reload; a rejected create has
not written an order and the local cart remains available.

Stripe and Swish webhooks/callbacks are not browser-version gated. Continue
settling and reconciling payments that started on the old backend. A status URL
without the new order capability displays only a local help page—never public
order/customer data and never a claim that payment succeeded or failed.

Inventory and disconnect every old backend deployment, function instance,
custom domain and alias. Observe the stable rejection code and current-contract
traffic for a reviewed drain period. A hostname list by itself is not evidence
that an old writer is gone.

## Phase 4 — constraints after the drain

Only after Phase 3 evidence, apply `phase4AfterLegacyDrain`. It builds the
reconciliation index concurrently, rechecks the enabled allocator, advances the
sequence without rewinding it and adds the positive-total/item/domain constraints
as `NOT VALID`. PostgreSQL enforces them for new rows while legacy invalid rows
remain available for investigation.

List and reconcile every invalid historical row before separately validating
constraints with the queries in the migration README. Preserve payment, refund,
provider-event, audit and accounting history. Never restore an older full backup
over orders or payments accepted after the backup boundary.

## Recovery boundaries

- Before Phase 4, the allocator remains compatible with the locked main writer,
  so a reviewed web/backend rollback can keep unique numbering. Reconcile every
  payment accepted during the attempt.
- After Phase 4, raw main is not a valid rollback because its zero-total parent
  insert is rejected. Use the reviewed bridge web/backend or a forward repair.
- Never promote a Preview artifact, point Preview at Production resources, rotate
  credentials, push, deploy or change aliases as part of local verification.
- Any ambiguous provider response remains pending for reconciliation. A 404 or
  timeout is not permission to start a second payment or refund.
