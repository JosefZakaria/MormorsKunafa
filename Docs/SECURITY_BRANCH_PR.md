# Proposed PR: Preserve storefront behavior while hardening payments and accounting history

**Prepared for human PR review; not approved for merge or deployment.** No PR
has been published. The tested application baseline is
`e8b7edf50a1e7fa268a58f252be1e42c32b6bc7e`; reviewed `origin/main` is
`33602a4417a4a1d15e44040c2acf5187d5a547d7`. The final documentation-only commit
is identified in the handoff because a commit cannot contain its own hash.

The branch incorporates the 68 formerly missing main commits while preserving
both locations, scoped administrators, per-location stock, editable variant
prices, hidden products, scheduled orders, menu editing and the current
dashboard. A phased database/web/backend bridge now supports legacy writers and
clients without weakening the secured checkout contract; hosted cutover evidence
is still required.

Checkout uses server-authoritative pricing, order-bound status access and safe
replay. Payment/event claims, cancellation races, ordinary and duplicate refunds,
Swish identities, session logout, preview isolation and operator database
connections are hardened. Paid/operational orders are protected from physical
deletion. New verified payments atomically snapshot the VAT values shown on the
receipt; legacy paid rows remain null for evidence-based accountant review.

## Local validation

- Node 24.18.1/npm 11.6.2; `npm run check` passes 178 tests, web/shared/backend
  builds and mobile/maintenance typechecks.
- Isolated PostgreSQL 17.11 validates the 30-file fresh track and 28-step phased
  legacy track, rollback, concurrent numbering, RLS/RPC, retention, accounting
  deletion protection, refund/provider history and receipt VAT snapshots.
- All three API suites pass against real local SQL and simulated Stripe/Swish,
  including replay, amount/identity checks, timeout recovery, concurrent refunds,
  notifier failure with a durable scoped staff queue, and 1,007 paid orders/
  2,014 lines in statistics.
- 22/22 Chromium cases pass on Desktop Chrome and Pixel 7, covering both pickup
  locations, legacy/current checkout responses, ambiguous response recovery,
  private status, cart, admin and logout.
- The PowerShell connection-isolation contract passes. CI now runs database, API
  and PowerShell integration checks in a separate Windows job. No production
  resource, customer record or real payment was used.

## Blocking merge and rollout conditions

- Rehearse the phased legacy cutover against a separate Supabase test project;
  prove real ledger/checksums, lock behavior, old-writer drain and preservation
  before Phase 4. Do not use Production or a copied customer database.
- Keep Preview blocked until its backend, database, Upstash and payment resources
  are independently isolated and the exact API origin is approved.
- Verify hosted Supabase grants/RLS/RPC/Storage, an independently restored backup,
  Stripe test mode, an official Swish sandbox/simulator, Upstash multi-instance
  behavior/region/access/24-hour expiry and notification/staffing recovery.
- `npm audit` still reports 26 dependency entries (9 high, 17 moderate, 0
  critical), limited by this review to four unresolved mobile build/tooling
  chains. No clean-audit or blanket risk-acceptance claim is made.
- The accountant must approve the preservation matrix, legacy VAT treatment and
  archive boundaries. The privacy owner must approve the field selection and
  intervals before either unscheduled retention mutation can run. Current
  90/1,095-day code boundaries are not legal approval.
- Credential rotation, incident response, provider agreements, staffing,
  accessibility/device testing and the final human release decision remain owner
  actions. Nothing here authorizes merge, deploy or Production access.

Use the exact open-item procedure in
[the external verification checklist](EXTERNAL_RELEASE_VERIFICATION.md), the
[accounting preservation matrix](ACCOUNTING_DATA_PRESERVATION.md), the
[full review and commit list](SECURITY_BRANCH_REVIEW.md), the
[dependency review](DEPENDENCY_REVIEW_2026-09-08.md) and the
[local reproduction guide](LOCAL_SECURITY_TESTS.md). The ignored local master
checklist is not part of Git.

Rollback must preserve every new order, item, VAT snapshot, provider identifier,
payment/refund/event/audit row and sequence state. Use a forward fix or tested
compatible build; never overwrite an active database with a pre-release backup
or blindly redeploy raw old main after Phase 4.
