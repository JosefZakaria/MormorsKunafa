# Accounting and payment-data preservation matrix

Status: final local code evidence, 2026-09-11. **No legal, accounting or
owner approval is recorded for this candidate.** The resumed task is local only;
[LOCAL_GOAL_OBJECTIVE.md](LOCAL_GOAL_OBJECTIVE.md) supersedes earlier external
authorization. No provider account access, login, hosted resource creation,
push/PR publication, deployment, merge, changed-main integration or Production
access is permitted. No hosted Supabase A/B, Preview, Upstash or Stripe test
resource has been created, and no hosted backup, restore or financial
reconciliation has been verified. Future external procedures below are inactive
and need a new explicit owner instruction after the local report.

The candidate accepts new **card payments only**. Swish checkout remains disabled
with no merchant credentials; external email/SMS/push delivery is outside the
candidate. Existing Swish/payment/refund/audit records remain protected. Disabling
new checkout does not remove historical provider references or reconciliation
code. Before any future release, staff must approve and rehearse handling orders
from the durable database queue while external notifications are disabled.

The final local candidate `ec04965833c8a6667e6886d3509757dc2e3b55e6` passed its complete
matrix: 193 backend tests, 22 browser cases, database/API/provider simulation,
connection isolation and real independent local restore. The sealed 315-path
source review and independent subsequent script review are finished; sealed coverage remains partial due to stale checkpoint entries, documented in the branch report. These results
support local behavior only. Three green hosted CI jobs on exact PR HEAD and the checks in
[EXTERNAL_RELEASE_VERIFICATION.md](EXTERNAL_RELEASE_VERIFICATION.md) are future
external evidence, not work authorized or required to finish this local stage.

This task has no Production access, including metadata. All current automated
data checks and backups use synthetic data in newly created independent local
databases. A future, separately authorized metadata-only procedure would require
a dedicated read-only role without SELECT on customer/order, auth or Storage
rows. The row/aggregate/receipt queries in this matrix and
`verify-security-posture.sql` must never be used for that metadata-only procedure.
Real-receipt review remains a separate human accounting decision.

Swedish bookkeeping rules require a verification record to make it possible to
identify when it was compiled, when the business event occurred, what it
concerns, the amount and counterparty, with an identifier or other link to the
recorded event. The exact material this business must retain and for how long
must be confirmed against the real accounting system and receipts. See the
[Swedish Bookkeeping Act](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/bokforingslag-19991078_sfs-1999-1078/)
and [BFN's archive guidance](https://www.bfn.se/fragor-och-svar/arkivering/).
BFN describes a seven-year archive period counted after the end of the calendar
year in which the financial year ended; it is not simply seven years from each
order date. IMY's [storage-limitation guidance](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/grundlaggande-principer/)
also requires personal data to be removed from day-to-day systems when it is no
longer needed there, even when a separate legal archive must remain.

## Preservation matrix

| Field or record | Purpose / dependency | Ordinary access | Current local behavior | Retention status | Required confirmation |
| --- | --- | --- | --- | --- | --- |
| `orders.id`, `order_number` | Stable link between order, receipt, payment, refund and audit evidence | Owner and location-scoped staff through authenticated admin routes; backend service role in the database; order number only through the customer capability | Never scrubbed. Paid or operational orders are protected from physical deletion by `protect_accounting_order_history`; legacy delete routes return `ACCOUNTING_HISTORY_PROTECTED` | No application deletion schedule exists | Accountant: confirm identifier/export format and link to the primary bookkeeping system |
| `created_at`, `updated_at`, terminal timestamps, verified payment audit time | Compilation, payment and fulfillment chronology | Same scoped admin access; service-role database access; immutable payment audit is not public | Retention does not change these fields. Verified online-payment time is also captured in `security_audit_log.created_at` | Preserve until the approved archive schedule says otherwise | Accountant: identify the authoritative transaction/accounting timestamp for every payment method |
| `order_type`, `location_id`, `payment_method`, `payment_status`, order/refund status | Classifies supply, place, payment and reconciliation state | Scoped staff/owner; service role | Retained. Location scoping is enforced in admin queries; public status exposes only bounded fulfillment fields behind an order capability | No deletion schedule | Accountant/owner: confirm which classification fields must appear in the archive and receipt |
| `total_ore`, `refunded_amount_ore` | Original gross consideration and cumulative refund reconciliation | Scoped staff/owner; service role | Retained and constrained; retention tests verify exact values before and after both scrub passes | No deletion schedule | Accountant: reconcile to settlement reports, bank records and bookkeeping totals |
| `receipt_vat_rate_percent`, `receipt_vat_ore` | Historical VAT values displayed on a receipt | Scoped staff/owner; service role; returned in the authenticated order DTO for receipt printing | New verified payments capture both fields atomically with the paid transition and payment audit. A database trigger permits that exact pending→paid snapshot once, then rejects rewrites; broad order `TRUNCATE` is also blocked. Existing paid rows remain `NULL`; no inferred backfill is performed | No deletion schedule | Accountant: review every legacy `NULL`, delivery fee, mixed supply, threshold/simplified-invoice case and historical rate before any separately reviewed forward correction |
| `order_items.product_name_snapshot`, `quantity`, `price_ore` | Describes what was sold and supports line/gross reconstruction | Scoped staff/owner; service role | Retained. The synthetic retention test verifies the original description, quantity and unit price remain readable | No deletion schedule | Accountant: confirm whether the stored description is sufficiently specific and how variants/fees are represented |
| `order_items.modifications_json` | Operational preparation detail; may contain free text | Scoped staff/owner; service role | Eligible for the current 90-day technical scrub pass; core item description, quantity and price remain | **Current code boundary only; not approved or scheduled** | Owner/privacy adviser/accountant: confirm it is not the sole evidence needed to describe a sale, complaint or allergen issue |
| Stripe session ID, Swish instruction/payment reference, `payment_provider_events` | Provider matching, replay control, settlement and disputed-payment investigation | Backend/service role; bounded owner alert routes where applicable | Retained; provider payloads/card credentials are not stored. New checkout is card-only; disabling Swish does not rewrite or remove its historical references | No deletion schedule | Accountant/owner: confirm reconciliation export and provider/account retention; separately record the excluded Swish activation scope |
| `order_refunds`, `order_refund_items`, `duplicate_stripe_refunds` | Immutable refund reservation, provider reference, amount, item allocation and completion | Owner or location-scoped refund routes as applicable; service-role reads; table mutation only through guarded RPCs | Foreign keys use `ON DELETE RESTRICT`; the retention test verifies succeeded refund/provider/allocation fields remain unchanged | No deletion schedule | Accountant: confirm credit-note/refund linkage and archive representation |
| `security_audit_log` payment/refund events | Evidence that an economic transition was accepted once | Service role and restricted operator review | Append-only triggers; financial transitions write audit events in the same database operation | No deletion schedule | Accountant/security owner: confirm export, monitoring and archive access |
| Name, email, phone | Fulfillment/contact and possibly counterparty identification | Scoped staff/owner; email/SMS/payment recipients where configured; service role | Current code can anonymize after a 1,095-day minimum cutoff, subject to terminal state, settlement and legal hold. The job is not scheduled | **Current code boundary only; not proof these fields may legally be removed then** | Accountant must decide whether counterparty identity is necessary for each receipt category; privacy owner must approve purpose and interval |
| Delivery JSON, internal/cancellation notes, customer status credential | Fulfillment, service and temporary customer access | Scoped staff/owner; status credential itself is customer-held and verified against its stored hash/expiry | Current code can scrub after a 90-day minimum cutoff, subject to terminal state, settlement and legal hold. The job is not scheduled. An independent status key issues v2; stored v1 remains verifiable with the prior JWT key. Preview requires a strong separate status key; v2 never falls back to JWT | **Current code boundary only; not approved** | Owner/privacy adviser: approve purpose, interval, legal holds and complaint/incident exceptions. Preserve valid legacy access when activating the separate key; do not rotate production keys in this task |
| Sealed minimal order-idempotency response in Upstash | Safe replay after a lost checkout response | Backend runtime holding the application secret; Upstash administrators see ciphertext for new values | New values exclude customer/contact/delivery/item data and seal only order ID/number, total, location, checkout marker and status capability with authenticated encryption bound to the storage key and payload hash. Code TTL is 86,400 seconds; processing locks use 600 seconds. A pre-change readable value may remain only for its already-running maximum 24-hour TTL | Hosted deletion, backup and log behavior unverified | Privacy/security owner: confirm EU region, least privilege, application-secret access, account logs/backups and actual expiry/deletion |
| Email receipt, provider settlement record, bookkeeping export and paper receipt/ticket | Copies or primary evidence outside the application database | Depends on mailbox/provider/accounting/printer controls | Code paths are mapped; existence, completeness and retention in real accounts are not locally proven. Email delivery is disabled for this candidate and cannot be assumed to supply its receipt/archive copy | External policy/contract | Owner/accountant: identify the authoritative copy, access owner, archive medium and destruction date; approve how a receipt is supplied while email is disabled |
| Application database backups and restored copies | Recovery of the public-schema accounting evidence chain | Named backup operators only | Candidate scripts isolate connections and require manifest v3, exact public-table catalog, `secured-ledgers`, `archiveScope=public-schema-only`, preserved ACLs and a source/target security metadata hash match. Hosted A→B backup/restore remains unverified | External schedule and deletion process unverified; this is not a backup of managed auth/Storage or object contents | Owner/accountant/privacy owner: approve frequency, encryption, access, independent restore tests, provider-managed recovery responsibilities and deletion reconciliation |

## Enforced local boundaries

- The admin UI no longer offers single-order or all-history deletion. Older
  clients receive HTTP 409 from the compatibility endpoints.
- The database permits physical deletion only while an order is still `ny` and
  `pending`. The only intended application callers are the bounded abandoned-
  checkout cleanup functions after their required provider checks.
- Paid, accepted, completed or cancelled orders cannot be physically deleted by
  the backend service role. Retention only nulls explicitly listed PII/free-text
  fields and appends an audit record.
- A restore or rollback must never replace new order/payment/refund/audit rows
  with an older snapshot.
- New Swish orders/payment starts require the explicit checkout flag. With the
  flag false, local simulation proves rejection while historical callbacks,
  status and partial/full/concurrent refunds continue to preserve their records.
  This is not certification of a configured Swish provider.
- Local notification-failure checks prove a paid order remains in its proper
  location-scoped database queue. Hosted SSE reconnect, reload, detection time
  and staffing approval remain open; external email/SMS/push delivery is deferred.

## Local restore evidence and future migration/recovery requirements

Correction `eb2cd50` contains nine files (+485/-12). It preserves public archive
ACLs and fingerprints column privileges, including grant options. The reproduced
column-only refund mutation bypass now fails the metadata gate; the regression
also checks client-column denials and fingerprint changes/restoration.

The new 146-line `scripts/test-backup-restore.mjs` passed in 85.8 seconds against
two independent newly created local PostgreSQL clusters. It ran the actual
PowerShell backup/restore operators and compared source/target orders=1, items=1,
paid gross=100 öre and audit=1. Column SELECT with grant option and expected
service/client permissions were preserved. The target's existing Storage
sentinel remained, rather than being replaced by the source bucket. These checks
cover that bounded fixture; it contains no comprehensive VAT/provider/refund
reconciliation and does not prove a Production backup or full hosted A=B equality.

The following hosted rehearsal remains inactive until the owner explicitly
authorizes a later stage. Production metadata access would need its own explicit
authorization before reconstructing a dataless legacy baseline in A.
Seed synthetic legacy orders, both locations/roles, pending provider references,
VAT cases and complete refund/audit ledgers. Select pending steps from the real
applied ledger and checksums, not filename sorting or the fresh-install list.
The current manifest contains 30 Phase 1 steps and one Phase 4 step; fresh install
contains 33 files. `2026-09-11-private-function-defaults.sql` is the additional
Phase 1 step beyond the original 29-step objective. Record hashes and UTC times,
use `ON_ERROR_STOP` and a five-second lock timeout, and stop on unknown migration,
checksum mismatch, incomplete index or invariant failure. Prove all old writers
are drained before Phase 4.

The acceptance backup must originate in A and restore to independent disposable
B using manifest format 3 and `accountingProfile=secured-ledgers`. Preserve
application ACLs and default privileges; match `securityMetadataSha256` before
and after backup and after restore. The public-only archive must exclude managed
auth/Storage schemas, object contents and large objects. Preserve the target's
provider-created public schema and owner; do not treat restored application data
as evidence that managed provider resources were backed up or recovered.

Require `restore=verified_against_source_profile` and source-matching security
metadata. A legacy compatibility profile or a partial set of financial ledgers
cannot pass this candidate's secured-ledger gate. That status checks the archive
identity/profile, target internal consistency and security metadata; it does not
establish financial A=B equality. The current manifest stores no source financial
counts/sums or data fingerprint. A matching security hash covers the selected
metadata, not every DDL definition or any application row.

Separately compare orders, items, paid
gross, VAT snapshots, provider events, audit, ordinary refunds, allocations and
duplicate-payment refunds using synthetic counts and aggregates captured from A
at the defined backup boundary and from restored B. This source/target comparison
remains open until its expected and observed values are recorded; target-only
printed counts or the script's verified status do not satisfy it.

Create an additional synthetic card payment in A after the backup boundary.
The recovery rehearsal must preserve that new payment and its records through a
forward correction or compatible build. Never restore the older archive over A
or any active database. Record durations, non-secret source/target identities,
archive hashes and cleanup ownership in the restricted release journal. Hosted
verification and the operational backup/rollback decision remain pending.

## Approval gate

Do not schedule or run either fulfilled-order anonymization pass with
`dryRun:false` until the owner and an accounting/privacy reviewer have completed
this table against real receipts and the actual bookkeeping archive. In
particular, the current 90- and 1,095-day minimum cutoffs are implementation
behavior, not evidence that the periods or selected fields are legally correct.
Do not backfill missing VAT snapshots from current code; use original evidence
and a documented accountant-approved correction process.

Record a named approver, date, candidate revision and supporting evidence for
each decision below. These are proposed decision subjects, **not approvals**.

| Decision for this candidate | Proposed approval subject | Status |
| --- | --- | --- |
| Historical VAT and accounting evidence | Preserve original financial records and existing `NULL` VAT snapshots; use original receipts for any separately approved forward correction | Pending accountant/owner decision |
| 90/1,095-day retention | Approve exact fields, purposes, intervals, legal holds and archive handling before either non-dry-run scrub pass is enabled | Pending privacy/accounting/owner decision |
| Backup and rollback | Approve public-only ACL-preserving A→B rehearsal, independent managed-resource recovery duties and forward recovery without overwriting later payments | Pending owner/accounting decision |
| Staffing without notifications | Approve staffing hours, receipt handling, queue polling/reload, maximum detection time and escalation owner after hosted rehearsal | Pending operations/owner decision |
| Remaining moderate advisories | Review each final moderate dependency advisory and its documented exposure; critical/high findings must still be zero | Pending owner decision on the final audit |
| Excluded features | Accept that Swish activation and external email/SMS/push delivery are outside this card-only candidate and are not claimed verified | Pending owner decision |

All six decisions remain pending. The agent may prepare local evidence and PR
text, then report results and risks to the owner. It may not publish a PR, push,
access provider accounts or Production, deploy or merge in this stage. The
inactive external checklist is a future decision aid, not authorization or a
requirement to obtain a login before finishing the local report.
