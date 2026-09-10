# External release-verification checklist

Status: every checkbox below is open. This document authorizes no production
access, deployment, payment, credential rotation or customer-data processing.

Use only newly created, disposable test resources containing synthetic names,
addresses, phone numbers, email sinks and payments. If a provider cannot supply
a genuine sandbox/simulator, leave that gate blocked; never substitute a small
production transaction or a copied production database.

## Evidence header

Record this in the restricted release journal before testing:

- [ ] exact `origin/main` commit and exact candidate branch commit;
- [ ] operator, reviewer, UTC start/end and ticket/change identifier;
- [ ] non-secret project/environment identifiers for the disposable Supabase,
  backend, web Preview, Upstash, Stripe and Swish resources;
- [ ] proof that every hostname, project, database, credential and provider mode
  differs from Production;
- [ ] synthetic-data seed identifier and cleanup owner;
- [ ] expected results, actual results, artifact hashes and unresolved failures.

Never paste credentials, tokens, certificates, customer data, raw provider
payloads or database dumps into Git, CI logs or this document.

## 1. Isolation preflight

- [ ] Create a separate Supabase test project/database and separate service-role
  credential. Confirm its project reference, host and database identity are not
  aliases for Production.
- [ ] Create a separate backend and web Preview configuration. Preview must use
  the disposable API origin, and that exact origin must pass the committed
  allowlist check. No Production origin may appear in Preview settings.
- [ ] Create a separate Upstash database and token. Confirm the region and that
  neither rate-limit nor idempotency keys can land in the Production database.
- [ ] Use Stripe test mode only. Confirm every key starts in test mode and every
  event has `livemode=false`.
- [ ] Use an officially supported Swish merchant sandbox/simulator with test
  certificate and test payee alias. Record the provider's sandbox evidence.
- [ ] Route email/SMS/push only to owned test sinks/devices, or leave the channel
  disabled. Use no real customer destination.
- [ ] Confirm logs, alerts and dashboards clearly label the environment TEST.

Expected result: all resource identities are distinct, outbound destinations
are controlled, and an attempted Production reference fails closed before any
schema write or payment initialization.

## 2. Supabase schema, migration and authorization

- [ ] Export schema metadata and the real applied-migration ledger/checksums from
  the disposable project. Compare them with `migration-order.json` or the phased
  `legacy-transition-order.json`; do not edit a checksum to make it match.
- [ ] Seed synthetic legacy orders, item rows, provider identifiers, a pending
  payment, a succeeded refund with allocation, an unresolved refund, both
  locations and both admin roles.
- [ ] Rehearse Phase 1 with the legacy writer still present. Demonstrate unique
  order numbers from legacy and RPC writers without overlap, then prove old
  writers/aliases are drained before Phase 4.
- [ ] Apply only pending migrations with the configured five-second lock timeout.
  Record lock duration, blocked sessions, rows changed and exact migration IDs.
- [ ] Verify old and new rows coexist with unchanged order IDs/numbers, gross
  amounts, items, provider IDs, refunds, allocations and audit events.
- [ ] Pay a new synthetic takeaway and eat-here order. Verify the paid transition,
  payment audit and `receipt_vat_rate_percent`/`receipt_vat_ore` are atomic and
  that receipt renderers use the stored values.
- [ ] List every already-paid row whose VAT snapshot is `NULL`. Review from
  original receipts with the accountant; do not auto-backfill it.
- [ ] Run `verify-security-posture.sql` read-only. Confirm forced RLS and no
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

- [ ] From the disposable source only, run the guarded safety-backup script to an
  encrypted, access-restricted location outside Git/cloud-sync. Record source
  fingerprint, archive SHA-256, manifest format 3, exact public-table catalog,
  declared accounting profile, tool versions and row-count aggregates.
- [ ] Independently confirm the restore target is another disposable server or
  project with a different hostname, database, user and credential. DNS aliases
  or a different database name on the source server do not prove isolation.
- [ ] Restore with the guarded restore script and explicitly supply the expected
  `legacy-core` or `secured-ledgers` accounting profile. Confirm the script emits
  `restore=verified_against_source_profile`; a partial ledger set must fail before
  restore. Then run `verify-security-posture.sql` and the VAT review.
- [ ] Reconcile counts and aggregates for orders, items, paid gross, VAT snapshots,
  payment events, security audit, ordinary refunds, refund allocations and
  duplicate-payment refunds.
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

## 5. Swish sandbox/simulator matrix

- [ ] Verify the test certificate chain, environment, payee alias and callback
  base before enabling the checkout choice.
- [ ] Create and retrieve a payment using the canonical 32-character uppercase
  wire ID. Verify amount, SEK, payee, order reference, status and bank payment
  reference before marking paid.
- [ ] Deliver duplicate/delayed callbacks and status polls concurrently; exactly
  one paid transition/audit must occur.
- [ ] Verify a historical dashed UUID reference remains matchable without
  rewriting stored history.
- [ ] Exercise partial/full/simultaneous refunds, response loss and callback
  recovery. An ambiguous sandbox 404 or unknown status must remain pending for
  manual reconciliation and must not cause another PUT.
- [ ] Prove wrong amount, currency, payee, order reference, instruction/refund ID,
  certificate and environment are rejected.

Expected result: canonical provider identity is preserved across every retry;
uncertainty is visible and never converted into a second money movement.

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
- [ ] Confirm credentials exist only in backend secret storage, are absent from
  web/mobile bundles and ordinary logs, and are restricted to named operators
  with MFA/audit where available.
- [ ] Confirm region, encryption, eviction/persistence policy, DPA/subprocessors,
  incident contact and account deletion behavior with account-specific evidence.

Expected result: cross-instance safety works, plaintext customer/order details
are absent from new replay values, sensitive capabilities have least-privilege
access and observed hosted expiry matches the code contract.

## 7. Notification failure and staffed queue

- [ ] With a paid synthetic order, fail email, SMS, push and realtime separately
  and together. Payment status/audit must remain committed and no unhandled
  notifier rejection may terminate the process.
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

- [ ] CI `build-and-test` and `integration-windows` are green on the exact commit.
- [ ] A read-only security diff review has no unresolved critical/high finding.
- [ ] The accountant has signed the preservation matrix and legacy VAT handling.
- [ ] The privacy owner has approved (or changed) the 90/1,095-day field selection
  and intervals. Until then both non-dry-run retention passes remain disabled.
- [ ] The owner has approved backup/restore, staffing, provider and rollback plans.
- [ ] Every external section above has linked evidence and an assigned owner.

Only after all applicable items pass may a human release owner decide whether to
merge or deploy. Passing local tests alone is never that decision.
