# Local PR text: Harden checkout and preserve accounting history

**Local preparation only; no push, PR publication, provider access or deployment.**
No PR has been published. [LOCAL_GOAL_OBJECTIVE.md](LOCAL_GOAL_OBJECTIVE.md)
supersedes the earlier external authorization: no account access, login attempt,
hosted resource creation, Preview/Production deployment, merge, changed-main
integration or Production access is permitted. The owner receives the local
results and risks first. Any external step needs a new explicit owner instruction
after its purpose and consequences have been explained; no login is requested.

Work continues from `2183660e81330f7c66144c8490b4aec19341ea5a` on `security-checks`.
The main baseline checked before the pause and now frozen locally is
`33602a4417a4a1d15e44040c2acf5187d5a547d7`; no remote refresh or main integration
is part of this stage.
The [release journal](RELEASE_JOURNAL_2026-09-11.md) records new commits, evidence,
external prerequisites and pending human decisions.

The branch preserves both locations, scoped administrators, location stock,
editable variant prices, hidden products, scheduled orders and the dashboard.
Checkout uses server prices, order-bound status access and encrypted minimized
idempotency replay. Payment and refund transitions preserve provider, audit and
accounting history. Verified payments atomically save the receipt VAT snapshot;
legacy paid rows remain unchanged for review against original evidence.

A future separately authorized phased database/backend/web cutover supports
concurrent legacy and atomic order-number writers, then rejects old purchase clients before writes. The
guarded backend precedes the current web during an explicit fail-closed checkout
window. Old writers must be demonstrably drained before final constraints.

This candidate enables card payments only. Preview requires Stripe test keys,
test events and test checkout sessions; explicit HTTPS frontend origins cannot
fall back to known Production origins. New status capabilities use an independent
v2 key while existing v1 capabilities remain valid against their stored hash and
expiry. New Swish checkout defaults off without disabling historical callbacks,
reconciliation or refunds. Email, SMS and push are outside the candidate; the
persistent location-scoped staff queue and reconnect behavior remain release gates.

Backup/restore retains public application ACLs and excludes managed auth/storage
objects and bytes. Manifest v3 binds archive scope and a security metadata hash,
including column ACLs and grant options.
A complementary migration fixes future PUBLIC function execution without
rewriting earlier migration files. Restore success requires the source accounting
profile, internal integrity and matching security metadata. Independent financial
aggregates at the backup boundary must still be compared separately in hosted A/B.

## Current local evidence

- Pinned Node 24.18.1/npm 11.6.2. The committed CI configuration has three
  independent jobs on exact PR-HEAD: build/mobile/audit, Windows
  database/API/isolation and Ubuntu browser. All jobs use ordinary clean `npm ci`;
  hosted GitHub runs remain inactive until a later explicit authorization.
- SDK 55 is separately committed as `e278e86`: Doctor 20/20, mobile types,
  Android/iOS exports, web build and 22 browser cases passed. Audit fell from
  9 high/17 moderate to 0 high/18 moderate.
- SDK 56 is separately committed as `344cb20`: mobile types, Android/iOS exports,
  web build and 22 browser cases passed; audit has 0 critical/high and 14 moderate.
  Doctor 21/22 exposed the known Hermes regression without suppressing its check.
  SDK 57 is committed as `e90597a`: clean install, Doctor 21/21, mobile types,
  Android/iOS exports, web build and 193 backend tests pass. Audit remains
  0 critical/high and 14 individually reviewed moderate entries. The complete
  revision-bound final matrix remains pending.
  See the [dependency review](DEPENDENCY_REVIEW_2026-09-08.md) for current evidence.
- Preview/payment commit `2abedcf` passed 193 backend tests, local API/Stripe
  simulation, Swish simulation with disabled checkout and 22 Chromium cases
  across desktop and Pixel 7. No external provider or real payment was used.
- Backup/security commit `eb2cd50` contains nine files (+485/-12). The reproduced
  column-only refund mutation bypass is fixed: the gate checks effective column
  privileges and the fingerprint retains column ACLs/grant options. Its regression
  checks pass. The migration adds a 30th Phase 1 step, followed by separate Phase 4;
  the fresh track contains 33 files.
- The new 146-line `scripts/test-backup-restore.mjs` passed in 85.8 seconds using
  two independent newly created local PostgreSQL clusters and the real operator
  scripts. Source/target orders=1, items=1, paid gross=100 öre and audit=1 matched;
  column SELECT/grant option and expected role denials were retained, as was the
  target's distinct Storage sentinel. The operator's verified status covers the
  archive/profile, internal consistency and selected security metadata. This
  bounded fixture does not establish full VAT/provider/refund A=B equality or
  verify any hosted/Production backup or recovery.
- A new complete Codex Security diff scan against the locally frozen main baseline is
  required after code/configuration freezes. The earlier scan's documented
  partial coverage is historical evidence and does not satisfy this final gate.

## Remaining local completion requirements

- Finish the SDK sequence and run the clean final candidate matrix: builds,
  security/dependency checks, backend/mobile/Doctor/exports, synthetic database,
  API/payment and real local A/B restore checks, and all 22 browser cases.
- Require 0 critical/high audit, document each remaining moderate entry and
  complete the independent security diff review after code/configuration freezes.
- Save reviewable commits, leave a clean worktree and provide a Swedish report
  of results, remaining risks and external checks not performed. Keep all six
  formal human decisions open; the report is not release or merge approval.

## Inactive future external checklist

The following are unperformed future procedures. They require a new explicit
owner instruction and are not required to finish the current local report.

- GitHub PR/protection/ruleset/Actions inspection and Vercel Git-link verification
  before any separately authorized normal branch push or Draft PR publication;
  either action may trigger deployment. No account login is requested now.
- Verified isolated backend/web Preview, Supabase A/B, Upstash and Stripe test
  resources, with public IDs, regions and exact origins recorded without secrets.
- Only with separate explicit permission, metadata-only Production access through
  a restricted role; no application,
  auth or Storage row reads. Hosted synthetic legacy rehearsal, checksum/lock
  evidence, writer drain, RLS/RPC/Storage checks and independent A/B recovery.
- Hosted card purchases, webhook ordering/retries, timeout recovery, refunds,
  identity/amount/currency/mode rejection and payment across the version boundary.
- Upstash two-instance replay/conflict/privacy checks, 600/86,400-second TTLs
  and an observed expiry after at least 24 hours. No expiry clock has started.
- Three green GitHub CI jobs on the exact future PR HEAD; local runs do not
  certify hosted Actions results.
- Six explicit owner/accounting/privacy decisions in the journal. None is
  approved merely by this document or a passing technical check.

Use the [external checklist](EXTERNAL_RELEASE_VERIFICATION.md),
[accounting preservation matrix](ACCOUNTING_DATA_PRESERVATION.md),
[review report](SECURITY_BRANCH_REVIEW.md) and
[local reproduction guide](LOCAL_SECURITY_TESTS.md). The locally ignored master
checklist is updated separately and is not part of Git.

Recovery preserves every new order, item, VAT snapshot, provider identifier,
payment/refund/event/audit row and sequence state. Use forward repair or a tested
compatible build; never replace an active database with a pre-release backup.
This remains local PR text for the owner's next decision. Nothing is published,
pushed, deployed or merged in this stage, and no provider or Production access
is authorized by this document.
