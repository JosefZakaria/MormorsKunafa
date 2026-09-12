# External release-verification checklist

Status 2026-09-12: **inactive future checklist; every checkbox remains open**.
The replacement objective in [LOCAL_GOAL_OBJECTIVE.md](LOCAL_GOAL_OBJECTIVE.md)
supersedes the earlier candidate scope and every prior authorization for external
work. No provider account access, login attempt, resource creation, push, PR
publication, Preview or Production deployment, merge, changed-main integration
or Production access is permitted. Do not request a login or start an expiry
follow-up in this local stage.

No isolated hosted resources have been created and no hosted migration, restore,
payment or expiry test has been performed. Every external procedure below is
retained for a possible later stage and requires a new explicit owner instruction
after its purpose and consequences have been explained. The local report comes first.

The candidate remains **card-only** and new Swish checkout remains disabled.
Verified order email, the existing non-delivery SMS flows, staff push and the
repeating staff alarm are now release requirements. They are not exclusions.
Real test delivery may use only the owner and named staff recipients after cost
and recipient approval; no new delivery-order SMS is to be added.

The unchanged dependency lock remains installed from the prior clean `npm ci`.
On the current working tree, `npm run check` passed with 207/207 backend tests,
the web build and mobile typecheck. `test:db`, the complete `test:api`, PostgreSQL
isolation and backup/restore passed; offline Android/iOS exports succeeded and
the full Playwright suite passed 24/24. Expo Doctor passed 19/21 offline; its
Expo API and React Native Directory checks remain blocked until external reads
are authorized. The prior online run on the same dependency lock passed 21/21,
and the prior audit reported 0 critical, 0 high and 14 moderate; neither external
read was repeated and no automatic fix was applied. None of these local results
closes a hosted checkbox or proves Production readiness.

Local backup/security correction `eb2cd50` changes nine files (+485/-12). Its
metadata gate and fingerprint now include column ACLs and grant options; the
reproduced column-only refund mutation bypass is fixed and regression-tested.
The new local `scripts/test-backup-restore.mjs` A/B run passed in 80.506 seconds using
two newly created independent local PostgreSQL clusters. It checks real operator
backup/restore, source/target `orders=1`, `items=1`, `paidGrossOre=100`,
`audit=1`, one Storage bucket, retained ACL/security metadata and the untouched
target sentinel. This bounded synthetic result is not full financial A=B
verification, a Production backup or evidence from hosted Supabase.

Local working-tree changes made on 2026-09-12 preserve stored customer times on
default acceptance, include future paid preorders in the acceptance queue and
derive the foreground alarm from the full pending queue without a separate
silence acknowledgement. The durable outbox, worker and protected maintenance
route are also present. These changes are **implemented and verified locally**
by the matrix above. Scheduling the route, live provider/push behavior and the
complete physical background-alarm chain remain unverified. A prior full run
correctly exposed a test regression when the active alarm blocked logout; the
test was corrected without hiding or weakening the alarm. The current full suite
passes 24/24, including shared-browser endpoint transfer and fail-soft logout
after an unsupported push-provider registration is rejected.

The prior local Codex Security diff scan
`8a3fdec0-93a2-4fcb-a10e-3d1cf051aced` sealed snapshot
`codex-security-snapshot/v1:sha256:95f4bc1909b3e0c7ff13d046f4c7c405f12b616c912c958508dc8dd642f6a6f9`
with complete 33/33 inventory coverage: 0 critical, 0 high, 0 medium and 1 low.
Three other candidates were suppressed after validation. The low finding is a
stale shared-browser Web Push binding across sequential staff/location accounts;
it exposes only order ID/number/time and does not bypass server authorization,
but it needs remediation or an explicit owner risk decision before shared-account
device use. The current working tree remediates that finding; the exact candidate
commit still requires its own final scan. The prior scan also led to correction
and re-test of retryable Resend transport errors and delivery-order failure-alert
scope; the full API suite passed after those corrections.

## Current status classification

### Verified

- The current local candidate's 207/207 backend tests, web/mobile builds and
  typechecks, both offline exports, database/API/isolation, independent A/B
  restore and full browser 24/24 results. Doctor is 19/21 offline with two
  explicitly external checks pending.
- The local timer/preorder/order-acceptance, queue/alarm, durable outbox, worker
  and protected maintenance-route behavior within synthetic automated tests.
- Historical local evidence on `ec04965`, within its bounded unchanged scope.
- Repository-level fail-closed Preview routing and the explicit legacy migration
  manifests. These do not prove the connected Vercel projects or databases.
- The prior sealed scan facts and documented checkpoint discrepancy; see below.
- The previous local security snapshot covered 33/33 inventory items with no
  critical, high or medium finding and one low Web Push account-binding finding.
  The current local candidate remediates that finding; a new final scan on the
  exact release commit remains mandatory.

### Remaining

- Freeze the reviewed source snapshot as an exact candidate commit.
- Verify the Web Push conflict quarantine, atomic account transfer, concurrent
  registration and endpoint-specific logout on the exact release commit.
- Complete the route audit, including every old writer, function, deployment
  route and alias, before cutover.
- Verify the configured every-minute schedule for protected `GET
  /api/internal/maintenance/process-outbound-messages`.
- Run the physical Android alarm matrix and live allowlisted provider/push tests.

### Blocked

- Hosted CI, provider sandboxes, physical-device alarm tests, Production backup,
  live provider/push delivery, scheduled maintenance execution, externally timed
  restore/cutover/rollback rehearsal and post-release follow-up. Each needs a
  separately approved external block or physical participation.
- The actual Vercel Git/deployment linkage, aliases and resource bindings remain
  unknown until authorized account inspection; therefore the hosted part of the
  route audit is also blocked.

### Requires owner decision

- Authorization to verify the free Supabase B slot, install `age`, access the
  complete source database/`site-media`, use private Google One and later delete B.
- External test recipients and email/SMS/card costs before any real send or buy.
- Staff/device availability, checkout-stop date, abort point and final release.
- Confirmation of the named location accounts for each shop tablet. Store
  tablets must not use the owner account.
- Final disposition of the Web Push remediation after the exact-commit scan.
- The 14 moderate advisories and real accounting/archive evidence. Mutating
  retention remains disabled. Swish deferral is already decided.

## Security-scan status

Prior scan `8a3fdec0-93a2-4fcb-a10e-3d1cf051aced` is formally complete for its
historical source snapshot: all 33/33 inventory items were closed, three
candidates were suppressed after validation and one low finding remained. There
were no critical, high or medium findings. The current source changes remediate
that low finding and therefore require a new exact-commit scan.

Sealed scan `eab014d1-3da0-4ed5-a3e0-fe8e67e5b403` covered the 315 frozen diff
paths through `2d200f0`; discovery, validation and attack analysis finished with
no unresolved candidate or reportable vulnerability. The sealed artifact still
says `partial` because two stale checkpoint deferred entries survived the
accepted final draft, whose status was `complete` with an empty deferred list.
The artifact is preserved and is not represented as formally complete.

The separate `coverage=complete` value in recorded scanner usage metadata is a
token-accounting field, not code-coverage status. An older scan's
`token_record_invalid` partial result is separate historical evidence. This
discrepancy remains visible as historical evidence but does not qualify or
replace the formally complete historical scan above.

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
- [ ] Configure isolated test-only email, SMS and push credentials only after the
  owner approves the provider cost and an allowlist containing only the owner and
  named staff. Prove attempts to address any other recipient fail closed. Keep
  delivery-order SMS unchanged and keep Swish credentials absent.
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
  sessions and exact migration IDs. The current manifests contain **32 Phase 1
  steps plus one Phase 4 step**, and **35 fresh-install files**. Private-function
  defaults, durable outbound messages and the single-active push-endpoint guard
  complement the original 29-step objective without rewriting applied migrations.
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

### Decided one-time release copy

The former recurring PITR/R2 alternatives are superseded. The owner has chosen
a one-time, no-additional-subscription release copy using the available Supabase
Free project slot and existing private Google One storage. Before any provider
access, first verify that the free Supabase B slot exists; if it does not, stop
and ask the owner again instead of creating or purchasing a resource.

- [ ] Pause checkout first and take the final copy immediately before PR/merge.
- [ ] Export the complete application database: data, schema, privileges and
  security metadata. Record tool versions and exact source identity privately.
- [ ] Separately enumerate and copy every real object in the Supabase Storage
  bucket `site-media`; a database backup does not contain these object bytes.
- [ ] Package database and Storage with a manifest, aggregate object counts and
  SHA-256 hashes for the archive components and every Storage object.
- [ ] Install the free `age` tool only after separate owner approval. Encrypt
  locally before upload. Never put the passphrase in Git, chat, logs or scripts.
- [ ] The owner alone stores the passphrase in the password manager. No reserve
  person receives it; this accepted single point of failure must remain visible.
- [ ] Upload only the encrypted archive to a private, non-shared Google One
  folder. Verify upload, fresh download and successful local decryption.
- [ ] Restore the database and `site-media` objects into independent Supabase B.
  Compare orders, order lines, amounts, payments, refunds, permissions and every
  Storage hash against the source-boundary manifest.
- [ ] Keep Supabase B for seven days. Delete it only after a separate explicit
  owner approval and create a one-time reminder when that approval is given.
- [ ] Retain the encrypted Google One archive long-term.

This is extra protection through release day, not a recurring backup. It cannot
contain future orders and therefore cannot guarantee recovery from future data
loss. Supabase Free has no automatic backups, and Storage object bytes must be
copied separately. References: [Supabase backups](https://supabase.com/docs/guides/platform/backups)
and [Supabase pricing](https://supabase.com/pricing).

The current local public-schema backup/restore harness remains useful regression
evidence but is not sufficient for this gate: it intentionally excludes real
Storage bytes and does not perform the required full source-to-B reconciliation.
The release journal must distinguish that bounded synthetic result from the new
complete database-and-Storage copy. Never restore the older release archive over
an active database containing later orders or payments; use a compatible forward
fix or a separately restored environment with Stripe reconciliation.

Expected result: the downloaded encrypted archive decrypts locally, the complete
database and `site-media` restore in B match their source-boundary manifest, and
no post-boundary payment can be overwritten.

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

## 7. Durable customer messages and staff alarm

Email, existing SMS, push and the repeating staff alarm are release requirements.
Every test uses synthetic orders and only owner-approved recipient addresses,
numbers and devices. Provider unavailability must never roll back a paid order or
make the customer/status page or staff order list unavailable.

### Durable outbox and real delivery

- [ ] Verify each relevant order transition creates one durable job per exact
  order, event and channel in the same database transaction. Concurrent duplicate
  transitions must not create duplicate work.
- [ ] Start two workers concurrently and prove a lease/claim permits at most one
  active sender per job while an expired claim becomes safely retryable.
- [ ] Verify bounded attempts, scheduled backoff, terminal failure and a scoped
  staff-visible failure view. A worker crash before and after provider acceptance
  must not silently lose the job or blindly resend an ambiguous delivery.
- [ ] Deliver the existing order email and each existing non-delivery SMS type to
  the approved sinks/devices. Confirm content, language, order identity, location
  and recipient. Prove no new delivery-order SMS is sent.
- [ ] Exercise provider 4xx, 5xx, timeout, accepted-response loss and recovery.
  Reconcile provider evidence with the job row and record whether manual review,
  retry or success is the safe outcome.
- [ ] With each provider offline in turn, verify payment status/audit remains
  committed and the customer status page plus staff order list continue to work.

### Durable order queue and acknowledgement

- [ ] Pay synthetic orders for Höja and Möllevången. Before any staff action,
  confirm each order is durably stored and appears only in the correct location's
  fresh pending/preorder query; the owner may see both.
- [ ] Confirm `Ta emot` atomically advances only that order through the existing
  status flow. It must remain in administration and no separate seen/silence
  acknowledgement may exist.
- [ ] Connect two devices for one location. Accept on one; prove the other stops
  alarming for that order after refreshing from server state while any other
  waiting order continues.
- [ ] Add a new order immediately after a prior acknowledgement and prove it
  starts a new alarm. Repeat with multiple simultaneously waiting orders.
- [ ] Reload, interrupt SSE/network, reconnect and restart the browser. Pending
  orders must be fetched from PostgreSQL and resume alarming without relying on
  the original push event.
- [ ] Verify accepting an order without an explicit time adjustment preserves
  the originally promised `estimated_ready_at`. In the 30-minus-5-minute case,
  approximately 25 minutes remain. Repeat for preorders and an explicit change.

### Physical alarm matrix

Record device model, Android/browser version, power/battery settings, installed
PWA/browser mode, notification permission, operator, timestamps, order IDs and
actual result. Test both location roles on their assigned real tablets.

| Device/location | Order view open and visible | Another app foreground | Screen locked | Network loss and reconnect | Shared acknowledgement and next order |
| --- | --- | --- | --- | --- | --- |
| Höja tablet | [ ] repeating sound until `Ta emot` | [ ] repeating background alert | [ ] repeating locked-screen alert | [ ] pending order and alarm recovered | [ ] other device stops only accepted order; later order alarms |
| Möllevången tablet | [ ] repeating sound until `Ta emot` | [ ] repeating background alert | [ ] repeating locked-screen alert | [ ] pending order and alarm recovered | [ ] other device stops only accepted order; later order alarms |

- [ ] Verify a Höja order never reaches or alarms Möllevången staff and vice
  versa, including push delivery and after reconnect.
- [ ] Measure alarm start, repeat interval, acknowledgement propagation and
  recovery time. Record the maximum acceptable operational detection time.
- [ ] If another-app or locked-screen repetition is unreliable, stop this release
  gate and present bounded technical alternatives with cost, operational burden
  and platform limitations. Do not silently reduce the requirement.

Expected result: customer messages are durable and controlled, paid orders stay
available during provider failure, and every unreceived order drives a
location-correct repeating alarm until that exact order is accepted.

## 8. Timed release, production proof and recovery

Every step needs operator/reviewer timestamps. Any mandatory failure is NO-GO;
the requirement must not be silently reduced.

1. [ ] Choose a night window while both stores are closed, normally around
   01:00, with at most 90 minutes of checkout downtime and a measured abort point.
2. [ ] Pause new purchases and inventory every already-started Stripe session.
   Preserve its order rows and keep late completions reconcilable.
3. [ ] Take, encrypt, upload, download, decrypt and restore the final complete
   database plus `site-media` backup. Abort if any check or time margin fails.
4. [ ] Present the exact commit, all test results, backup evidence, migration
   order and residual risks to the user and owner.
5. [ ] Only after both say GO, the user creates the PR and performs merge. Codex
   must not push, create the PR or merge it.
6. [ ] Keep checkout paused after deployment.
7. [ ] On both real Android shop tablets with their respective location accounts,
   test open view, another app, locked screen, reload, network loss/reconnect,
   acknowledgement and complete location isolation.
8. [ ] Through the ordinary owner flow, create a clearly labelled 3 kr test item
   and activate it in only one store at a time.
9. [ ] Open each store very briefly under supervision, make one incognito purchase,
   pause again, and verify order, push, sound, email and SMS. Make exactly two
   purchases total and refund both after separate cost approval.
10. [ ] Disable the test item. Do not delete product, order, payment or refund
    history.
11. [ ] If only one store passes, open only that store after user-and-owner GO;
    keep the other paused.
12. [ ] Follow the first open sales shift and verify at least one ordinary
    customer order per store. If a store has no order, keep that check pending.

Never place an old backup over the active production database. Use a compatible
forward fix or a separate restored environment with Stripe reconciliation, and
keep checkout closed until data integrity is proved.

## 9. Release decision

- [ ] CI `build-and-test`, `integration-windows` and `browser-ubuntu` are green on
  the exact PR HEAD, with linked run URLs. Verify Node 24.18.1, npm 11.6.2, clean
  `npm ci`, build/security checks, all backend tests, Expo Doctor/typecheck/both
  mobile exports, PostgreSQL/API/provider simulations, 22 browser cases and
  `npm audit --audit-level=high`. Local success does not certify hosted Actions;
  native exports are compatibility evidence, not a separate app release.
- [ ] Final dependency audit has zero critical/high; each remaining moderate
  advisory is individually documented and submitted for an owner decision.
- [ ] A final security diff review against the locally frozen main baseline covers
  every new candidate commit and has no unresolved critical/high finding. Preserve
  the prior sealed partial/checkpoint explanation; do not rerun solely to change
  that immutable flag and do not integrate a changed main.
- [ ] The exact candidate has passing timer/preorder, durable outbox, worker
  concurrency/retry, multi-order alarm, location isolation and reconnect tests.
- [ ] The physical alarm matrix passes for both store tablets, including another
  app and locked screen. Any mandatory failure is NO-GO.
- [ ] Real allowlisted order email, existing SMS and staff push delivery pass,
  while provider failure leaves payment, customer status and staff queue intact.
- [ ] The accountant has signed the preservation matrix and legacy VAT handling.
- [ ] The privacy owner has approved (or changed) the 90/1,095-day field selection
  and intervals. Until then both non-dry-run retention passes remain disabled.
- [ ] The complete database plus `site-media` release archive has been locally
  `age`-encrypted, privately uploaded, downloaded, decrypted and restored in B,
  with all required data/permission/hash comparisons passing.
- [ ] The owner has recorded that new Swish checkout is deferred. Email, existing
  SMS, staff push and alarm are verified requirements, not accepted exclusions.
- [ ] The twelve-step release procedure passes within the approved stop window
  and preserves/reconciles every post-backup payment.
- [ ] Every external section above has linked evidence and an assigned owner.
- [ ] The exact local commit, test evidence, backup proof, migration order and
  residual risks have been presented. Codex has not pushed or opened a PR; the
  user creates the PR and performs merge only after the user and owner say GO.

The local stage ends with reviewable commits, a clean worktree, the final local
test matrix and a Swedish report of results, risks and unperformed external
checks. It does not require executing this inactive hosted checklist or
publishing a Draft PR. Keep every external box and owner decision open until
evidenced. Any later external stage, including push/PR publication that could
trigger deployment, needs a new explicit owner instruction; this document grants
no permission to merge or deploy.

## 10. Post-release verification

- [ ] The owner and staff follow the first sales shift. For each store, record the
  first real card order's database/payment reconciliation, customer messages,
  correct-location staff receipt, alarm and acknowledgement without copying PII
  into this repository.
- [ ] Keep the encrypted Google One release archive long-term. Confirm Supabase B
  remains available for seven days; any later deletion needs explicit approval.
- [ ] Reconcile real sales/refunds with the bookkeeping source selected by the
  owner/accountant. Do not assume Stripe alone can reconstruct an order.
- [ ] If a store has not yet received a real order, keep that store's check open.
  Do not claim completion or unattended monitoring.

Expected result: the release is closed only after both stores, financial records,
customer messages, staff order handling and the verified release backup have
direct evidence or an explicitly recorded waiting check.
