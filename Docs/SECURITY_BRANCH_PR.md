# Proposed PR: Preserve current storefront features while hardening payments and administration

**Draft review material only — not approved for merge or deployment.** No PR has been published. Code verification is pinned to `cf12824f708b453275add1d62e2d68799ef0c62e`; merged main is `33602a4417a4a1d15e44040c2acf5187d5a547d7`.

The previous security branch was 68 commits behind main. This change merges main into security-checks while preserving both locations, scoped administrators, per-location stock, editable variant prices, hidden products, scheduled orders, menu editing and the current dashboard.

Checkout now retains server-authoritative pricing and order-bound status access across those features. Payment/event claims, cancellation races, ambiguous ordinary/duplicate refunds, Swish identities and refund recovery, cookie logout, retention and operator database connections are hardened with regression coverage. Old ambiguous transfers stay reserved for reconciliation. Large statistics/exports no longer silently stop at a hosted row cap.

## Validation

- Clean installation with Node 24.18.1/npm 11.6.2; `npm run check` passes 168 tests, web/shared/backend builds and mobile/maintenance typechecks.
- Isolated PostgreSQL 17.11 upgrade/ledger/rollback/concurrency/RLS/RPC/retention checks pass.
- All three API suites pass with real local SQL and simulated Stripe/Swish; includes amount/identity checks, timeout recovery, concurrent refunds and 1007 paid orders/2014 lines in statistics.
- 14/14 Chromium browser cases pass across desktop and Pixel 7, covering both pickup locations, payment return/private status, cart and admin/logout.
- Mocked backup/restore connection-isolation contracts pass. No production resource or real payment was used.

## Blocking review and rollout conditions

- Old clients lack the capability/idempotency/location contract, and old MAX order writers cannot coexist with the sequence writer. A usable compatible cutover is still required; weakening auth or exposing customer data is not acceptable.
- The checked-in web rewrite also sends ordinary Preview traffic to the production API. Preview resources/rewrite must be isolated first.
- Actual Supabase schema/migration history/grants/Storage and provider sandbox/merchant/webhook behavior remain unverified.
- npm audit still reports 9 high and 20 moderate package entries; see the scoped dependency report. No blanket dependency or release approval is claimed.
- Notification delivery, Upstash customer-data retention, operational ownership and legal/provider checks remain separate gates. Rotation belongs to the owner later.

See [the full review and commit list](SECURITY_BRANCH_REVIEW.md), [file inventory](SECURITY_REVIEW_FILES.md), [dependency review](DEPENDENCY_REVIEW_2026-09-08.md) and [local reproduction guide](LOCAL_SECURITY_TESTS.md). The local master checklist is intentionally not part of Git.

Future rollback must preserve all new orders, payment/refund/event/audit records and sequence state. Use a forward fix or tested compatible build; never overwrite the active database with a pre-release full backup or blindly redeploy old main. The full report defines the prerequisite and reconciliation order.
