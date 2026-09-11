# External release-verification checklist

Status 2026-09-11: **inactive future checklist; all 71 checkboxes remain open**.
The current task is local preparation only, under
[LOCAL_GOAL_OBJECTIVE.md](LOCAL_GOAL_OBJECTIVE.md). The owner's resumed instruction
supersedes the earlier authorization for external work. No provider account access,
login attempt, resource creation, push, PR publication, Preview or Production
deployment, merge, changed-main integration or Production access is permitted.
Do not request a login or start an expiry follow-up in this local stage.

No isolated hosted resources have been created and no hosted migration, restore,
payment or expiry test has been performed. Every external procedure below is
retained for a possible later stage and requires a new explicit owner instruction
after its purpose and consequences have been explained. The local report comes first.

The candidate is **card-only**. New Swish checkout and external email/SMS/push
delivery are outside its scope and must remain disabled. Their disabled state
and the staffed PostgreSQL order queue still require hosted verification.

The latest intermediate local candidate passed 193 backend tests and 22 browser
cases on desktop/mobile Chromium, including status-token v1/v2 compatibility.
Local API/provider simulations passed; these are not hosted provider evidence.
Repeat the required matrix on the final candidate and record its exact commit.

Local backup/security correction `eb2cd50` changes nine files (+485/-12). Its
metadata gate and fingerprint now include column ACLs and grant options; the
reproduced column-only refund mutation bypass is fixed and regression-tested.
The new 146-line `scripts/test-backup-restore.mjs` passed in 85.8 seconds using
two newly created independent local PostgreSQL clusters. It checks real operator
backup/restore, source/target orders=1, items=1, paid gross=100 öre, audit=1,
retained column SELECT/grant option, role denials and the untouched target Storage
sentinel. This bounded synthetic result is not full financial A=B verification,
a Production backup or evidence from hosted Supabase.

Any later authorized hosted rehearsal must use newly created, disposable test
resources containing synthetic names,
addresses, phone numbers, email sinks and payments. If a provider cannot supply
a genuine sandbox/simulator, leave that gate blocked; never substitute a small
production transaction or a copied production database.

## Evidence header

For a separately authorized future hosted run, record this in the restricted
release journal before testing:

- [ ] exact `origin/main` commit and exact candidate branch commit;
- [ ] operator, reviewer, UTC start/end and ticket/change identifier;
- [ ] non-secret project IDs, hostnames, regions and environment modes for
  disposable Supabase A and B, backend/web Preview, Upstash and Stripe test mode;
- [ ] proof that every hostname, project, database, credential and provider mode
  differs from Production;
- [ ] synthetic-data seed identifier and cleanup owner;
- [ ] expected results, actual results, artifact hashes and unresolved failures.

Never paste credentials, tokens, certificates, customer data, raw provider
payloads or database dumps into Git, CI logs or this document.

## 1. Isolation preflight

- [ ] Create independent Supabase projects A (migration/test source) and B
  (restore target), with separate users/credentials. Verify their project
  references, hostnames, regions and identities against Production and each other.
- [ ] Create a separate backend and web Preview configuration. Preview must use
  the disposable API origin, and that exact origin must pass the committed
  allowlist check. No Production origin may appear in Preview settings.
- [ ] Inspect Vercel's Git/deployment settings before the first push or PR;
  either can trigger a deployment. Create the backend Preview first and verify
  its stable HTTPS origin and every alias/redirect before committing that exact
  origin to `APPROVED_PREVIEW_API_ORIGINS`. Configure web `/api` to the same origin.
- [ ] Configure independent strong test `JWT_SECRET`, `CRON_SECRET`, operational
  secrets, `REFUND_PASSWORD_HASH` and `ORDER_STATUS_TOKEN_SECRET`. Preview requires
  a status key of at least 32 bytes distinct from JWT. New tokens use v2; existing
  v1 tokens retain their JWT signature and mandatory stored hash/expiry checks.
  Preserve the previous JWT key for valid legacy tokens; v2 has no JWT fallback.
- [ ] Set the exact web Preview `PUBLIC_WEB_APP_URL` and CORS origins. Verify
  production aliases are denied, cookies/CSRF and SSE use same-origin `/api`, and
  catalogue, admin roles, checkout, payment return, private cache and security
  headers work through the hosted proxy. Never promote a Preview artifact.
- [ ] Create a separate Upstash database and token. Confirm the region and that
  neither rate-limit nor idempotency keys can land in the Production database.
- [ ] Use Stripe test mode only. Confirm every key starts in test mode and every
  event has `livemode=false`.
- [ ] Set `SWISH_CHECKOUT_ENABLED=false`; configure no Swish certificate, private
  key or merchant credential. Verify the web shows no Swish payment choice.
- [ ] Leave email/SMS/push credentials unconfigured and delivery disabled. Use no
  real customer destination. Provider delivery and Swish activation remain outside
  this candidate, not completed release gates.
- [ ] Confirm logs, alerts and dashboards clearly label the environment TEST.

Expected result: all resource identities are distinct, outbound destinations
are controlled, and an attempted Production reference fails closed before any
schema write or payment initialization.

## 2. Supabase schema, migration and authorization

- [ ] Only after separate explicit authorization for Production metadata access,
  obtain schema/DDL and migration-ledger metadata through a
  dedicated read-only role. That role must have no SELECT on application customer
  or order rows, authentication data or Storage contents. Export no data and do
  not run row-count, receipt, aggregate or accounting-integrity queries against
  Production. Record the metadata artifact hashes in the restricted journal.
- [ ] Reconstruct a dataless legacy baseline in A from that metadata, compare its
  real applied ledger/checksums with `legacy-transition-order.json`, and select
  only pending steps. Never use the fresh-install manifest for a legacy database
  or edit a checksum to make it match.
- [ ] Seed synthetic legacy orders, item rows, provider identifiers, a pending
  payment, a succeeded refund with allocation, an unresolved refund, both
  locations and both admin roles.
- [ ] Rehearse Phase 1 with the legacy writer still present. Demonstrate unique
  order numbers from legacy and RPC writers without overlap, then prove old
  writers/aliases are drained before Phase 4.
- [ ] Apply only pending migrations with the configured five-second lock timeout.
  Record `ON_ERROR_STOP`, source file hashes, UTC start/end, lock duration, blocked
  sessions and exact migration IDs. The current manifests contain **30 Phase 1
  steps plus one Phase 4 step**, and **33 fresh-install files**. The additional
  Phase 1 step is `2026-09-11-private-function-defaults.sql`; it complements the
  original 29-step objective without rewriting an applied migration.
- [ ] Stop on unknown migration, checksum mismatch, incomplete index or invariant
  failure. Prove every old writer/alias is drained before the separate Phase 4.
- [ ] Verify old and new rows coexist with unchanged order IDs/numbers, gross
  amounts, items, provider IDs, refunds, allocations and audit events.
- [ ] Pay a new synthetic takeaway and eat-here order. Verify the paid transition,
  payment audit and `receipt_vat_rate_percent`/`receipt_vat_ore` are atomic and
  that receipt renderers use the stored 6% takeaway / 12% eat-here snapshots.
- [ ] Exercise historical `NULL` VAT snapshots using synthetic rows in A/B.
  Prepare the real-receipt review for the accountant/owner as a separate human
  decision; this task must not read Production paid-order rows or auto-backfill.
- [ ] Run `verify-security-posture.sql` read-only against synthetic A/B only;
  it includes application-data checks and must never serve as a Production
  metadata-only query. Confirm forced RLS and no
  anonymous/authenticated access to orders, items, admins, locations, payment
  events or refund ledgers.
- [ ] For every security-definer/financial/maintenance function, verify
  `anon=false`, `authenticated=false` and only the intended service role has
  `EXECUTE`. Verify default privileges do not reopen future objects.
- [ ] Through hosted APIs, prove an owner sees both locations, each location role
  sees only its own pickup orders, and unknown/inactive/revoked admins fail closed.
- [ ] Through hosted Storage, prove an owner can upload only an allowed bounded
  raster to the configured bucket/path; location staff, SVG, fake MIME, oversized,
  traversing and cross-bucket requests must fail. Confirm object ACL/read behavior.
- [ ] Verify paid or operational order deletion fails at both compatibility API
  endpoints and the database trigger; separately verify only provider-reconciled
  new/pending synthetic drafts can be physically removed.

Expected result: no data loss or cross-location access; every negative case is
denied; historical financial fields and the new VAT snapshots remain readable.

## 3. Protected backup and independent restore

`restore=verified_against_source_profile` currently attests the checked archive
identity/profile, the target's internal accounting consistency and matching
security metadata. The manifest contains no source financial counts/sums or
data fingerprint, and the script does not compare A's economic contents with B.
The separate source/target reconciliation below remains an open acceptance gate;
capture its source evidence at the defined backup boundary, before later test
payments are added. A matching security hash is not a full DDL or data fingerprint.

- [ ] From disposable A only, run the guarded safety-backup script to an
  encrypted, access-restricted location outside Git/cloud-sync. Record source
  fingerprint, archive SHA-256, manifest format 3, exact public-table catalog,
  `accountingProfile=secured-ledgers`, tool versions and synthetic row aggregates.
- [ ] Require `archiveScope=public-schema-only`, `privilegesIncluded=true` and
  `securityMetadataSha256` in the manifest. Preserve application ACLs/default
  privileges; reject non-public/unsupported archive entries. Do not dump or
  restore provider-managed auth/Storage schemas, object contents or large objects.
  Verify source security metadata is unchanged across the backup boundary.
- [ ] Independently confirm the restore target is another disposable server or
  project with a different hostname, database, user and credential. DNS aliases
  or a different database name on the source server do not prove isolation.
- [ ] Restore only to independent disposable B with the guarded restore script
  and explicitly require `secured-ledgers`. Confirm the script emits
  `restore=verified_against_source_profile`; a partial ledger set must fail before
  restore. Require the restored security metadata hash to match A and run the
  security/VAT checks on B. A passing `legacy-core` compatibility test does not
  satisfy this candidate's secured-ledger acceptance gate.
- [ ] Confirm B's provider-created public schema/owner is preserved and the
  archive's application ACLs are restored. Record any required future-object
  default-privilege changes for the disposable restore operator; do not alter
  existing provider-managed objects or assume that a public archive backs them up.
- [ ] Reconcile counts and aggregates for orders, items, paid gross, VAT snapshots,
  payment events, security audit, ordinary refunds, refund allocations and
  duplicate-payment refunds against source evidence captured at A's backup
  boundary. Record expected/observed results and mismatches separately from the
  script's profile/metadata status; do not substitute B-only printed counts.
- [ ] Create additional synthetic orders/payments after the backup. Demonstrate
  that the recovery plan uses a forward fix or compatible build and never
  restores the older archive over those newer rows.
- [ ] Record restore duration and recovery decision, then securely destroy test
  archives/databases under the approved test-data schedule.

Expected result: the independent restore is internally consistent and the
rollback rehearsal cannot overwrite payments accepted after the backup boundary.

## 4. Stripe test-mode payment matrix

- [ ] Verify checkout amount, SEK currency, payment mode, allowed method, order
  metadata, saved Checkout Session and PaymentIntent against the synthetic order.
- [ ] Deliver signed events normally, duplicated, delayed, reordered and in
  parallel with the return confirmation. Exactly one paid transition/audit must
  occur; a live event lease must remain retryable.
- [ ] Start a payment with the previous compatible build, complete it after the
  candidate migration, and verify status access, amount and ledger preservation.
- [ ] Exercise provider timeouts before acceptance and accepted-response loss.
  Reuse canonical provider state; never initiate an ambiguous second transfer.
- [ ] Exercise partial, full and simultaneous refunds, expired idempotency keys,
  callback retries and a genuine second paid session. Reconcile provider totals,
  refund ledgers, item allocations and immutable audit events.
- [ ] Prove altered order ID, session ID, amount, currency, mode, method,
  metadata and `livemode=true` are rejected.

Expected result: no duplicate charge/refund is initiated by a retry, and every
accepted economic transition has exact provider and database evidence.

## 5. Swish remains disabled

- [ ] Confirm `SWISH_CHECKOUT_ENABLED=false` in the deployed backend, no merchant
  credentials/certificates, and no Swish choice in web checkout.
- [ ] Attempt a direct new Swish order and payment start with synthetic input;
  both must fail without creating a payment or new order.
- [ ] Record the local regression evidence that disabling new checkout preserves
  historical status/callback/refund code and unchanged dashed/compact provider
  references. Do not configure or contact a Swish provider to repeat those cases
  for this card-only candidate.
- [ ] Obtain the owner's explicit scope decision that Swish activation, merchant
  certification and hosted Swish payment/refund verification are deferred.

Expected result: no new Swish payment can start. Historical financial evidence
is preserved. Deferred Swish activation is not marked verified or completed.

## 6. Upstash multi-instance privacy and expiry

- [ ] Run two candidate backend instances against the disposable Upstash database.
  Confirm contact/IP rate limits are shared and use only hashed/HMAC-derived keys.
- [ ] Send the same order/key concurrently to both instances. Exactly one order is
  created and both clients recover the same response; reuse with changed payload
  must conflict.
- [ ] Inspect only the synthetic value. Confirm the raw idempotency key is absent
  from the Redis key and the completed value is authenticated ciphertext. After
  replay, confirm the result contains only order ID/number, total, location,
  checkout marker and status capability—not customer/contact/delivery/items.
- [ ] During a controlled upgrade rehearsal, seed a pre-change readable replay
  and confirm it remains replayable only for its already-running TTL while every
  newly completed record uses the sealed format.
- [ ] Confirm the processing lock TTL is 600 seconds and a completed response TTL
  is 86,400 seconds on the hosted record. Confirm an expired lock can be acquired.
- [ ] After the full 24-hour boundary, prove the completed record is no longer
  readable. Record provider backup/snapshot/log behavior separately; key TTL alone
  does not prove erasure from backups or account logs.
- [ ] Record the initial UTC timestamp and schedule a quiet follow-up at least
  24 hours later. Notify only on completion, failure or required action; leave
  observed expiry open until the same synthetic record is actually absent.
- [ ] Confirm credentials exist only in backend secret storage, are absent from
  web/mobile bundles and ordinary logs, and are restricted to named operators
  with MFA/audit where available.
- [ ] Confirm region, encryption, eviction/persistence policy, DPA/subprocessors,
  incident contact and account deletion behavior with account-specific evidence.

Expected result: cross-instance safety works, plaintext customer/order details
are absent from new replay values, sensitive capabilities have least-privilege
access and observed hosted expiry matches the code contract.

## 7. Disabled notifications and staffed queue

External email/SMS/push delivery is outside the candidate. The checks below prove
the disabled state and order handling; they do not certify provider delivery.

- [ ] With all email/SMS/push credentials absent, pay a synthetic order. Payment
  status/audit must remain committed. Rehearse realtime failure/reconnect and
  retain local tests of individual notifier rejection; no notifier failure may
  roll back payment or terminate the process.
- [ ] Confirm the correct owner/location sees the order in pending or pre-orders
  through a fresh database query/poll after every failure; another location must
  not see it.
- [ ] Disconnect/reconnect SSE and reload the admin UI. The durable PostgreSQL
  queue, not a transient notification, must recover the order.
- [ ] Have a test staff member acknowledge/process the order and record detection
  time. Define staffing hours, polling/reload procedure and escalation owner.
- [ ] Decide whether the absence of a durable notification outbox is acceptable;
  if not, leave release blocked until one is implemented and monitored.

Expected result: notifier failure can delay an alert but cannot hide or roll back
the paid order, and staff have a tested operational fallback.

## 8. Release decision

- [ ] CI `build-and-test`, `integration-windows` and `browser-ubuntu` are green on
  the exact PR HEAD, with linked run URLs. Verify Node 24.18.1, npm 11.6.2, clean
  `npm ci`, build/security checks, all backend tests, Expo Doctor/typecheck/both
  mobile exports, PostgreSQL/API/provider simulations, 22 browser cases and
  `npm audit --audit-level=high`. Local success does not certify hosted Actions.
- [ ] Final dependency audit has zero critical/high; each remaining moderate
  advisory is individually documented and submitted for an owner decision.
- [ ] A new complete security diff review against the locally frozen main baseline covers
  all candidate commits, validates candidates and has no unresolved critical/high
  finding or unexplained partial coverage. Do not integrate a changed main.
- [ ] The accountant has signed the preservation matrix and legacy VAT handling.
- [ ] The privacy owner has approved (or changed) the 90/1,095-day field selection
  and intervals. Until then both non-dry-run retention passes remain disabled.
- [ ] The owner has approved backup/restore, staffing, provider and rollback plans.
- [ ] The owner has explicitly accepted this candidate's exclusions: Swish and
  external email/SMS/push delivery. No historical or inferred approval substitutes
  for a recorded decision on this candidate.
- [ ] Every external section above has linked evidence and an assigned owner.
- [ ] The normal fast-forward branch push and updated Draft PR have exact commit,
  PR and CI links; the worktree is clean and all changes are reviewable commits.

The local stage ends with reviewable commits, a clean worktree, the final local
test matrix and a Swedish report of results, risks and unperformed external
checks. It does not require executing this inactive hosted checklist, publishing
a Draft PR or obtaining the six formal owner decisions. Keep every box and
decision open. Any later external stage, including push/PR publication that could
trigger deployment, needs a new explicit owner instruction; this document grants
no such permission and no permission to merge or deploy.
