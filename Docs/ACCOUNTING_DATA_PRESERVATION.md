# Accounting and payment-data preservation matrix

Status: local code evidence, 2026-09-10. Not legal or accounting approval.

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
| Stripe session ID, Swish instruction/payment reference, `payment_provider_events` | Provider matching, replay control, settlement and disputed-payment investigation | Backend/service role; bounded owner alert routes where applicable | Retained; provider payloads/card credentials are not stored | No deletion schedule | Accountant/owner: confirm reconciliation export and provider/account retention |
| `order_refunds`, `order_refund_items`, `duplicate_stripe_refunds` | Immutable refund reservation, provider reference, amount, item allocation and completion | Owner or location-scoped refund routes as applicable; service-role reads; table mutation only through guarded RPCs | Foreign keys use `ON DELETE RESTRICT`; the retention test verifies succeeded refund/provider/allocation fields remain unchanged | No deletion schedule | Accountant: confirm credit-note/refund linkage and archive representation |
| `security_audit_log` payment/refund events | Evidence that an economic transition was accepted once | Service role and restricted operator review | Append-only triggers; financial transitions write audit events in the same database operation | No deletion schedule | Accountant/security owner: confirm export, monitoring and archive access |
| Name, email, phone | Fulfillment/contact and possibly counterparty identification | Scoped staff/owner; email/SMS/payment recipients where configured; service role | Current code can anonymize after a 1,095-day minimum cutoff, subject to terminal state, settlement and legal hold. The job is not scheduled | **Current code boundary only; not proof these fields may legally be removed then** | Accountant must decide whether counterparty identity is necessary for each receipt category; privacy owner must approve purpose and interval |
| Delivery JSON, internal/cancellation notes, customer status credential | Fulfillment, service and temporary customer access | Scoped staff/owner; status credential itself is customer-held and hash-verified | Current code can scrub after a 90-day minimum cutoff, subject to terminal state, settlement and legal hold. The job is not scheduled | **Current code boundary only; not approved** | Owner/privacy adviser: approve purpose, interval, legal holds and complaint/incident exceptions |
| Sealed minimal order-idempotency response in Upstash | Safe replay after a lost checkout response | Backend runtime holding the application secret; Upstash administrators see ciphertext for new values | New values exclude customer/contact/delivery/item data and seal only order ID/number, total, location, checkout marker and status capability with authenticated encryption bound to the storage key and payload hash. Code TTL is 86,400 seconds; processing locks use 600 seconds. A pre-change readable value may remain only for its already-running maximum 24-hour TTL | Hosted deletion, backup and log behavior unverified | Privacy/security owner: confirm EU region, least privilege, application-secret access, account logs/backups and actual expiry/deletion |
| Email receipt, provider settlement record, bookkeeping export and paper receipt/ticket | Copies or primary evidence outside the application database | Depends on mailbox/provider/accounting/printer controls | Code paths are mapped; existence, completeness and retention in real accounts are not locally proven | External policy/contract | Owner/accountant: identify the authoritative copy, access owner, archive medium and destruction date |
| Database backups and restored copies | Availability and recovery of the complete evidence chain | Named backup operators only | Local scripts isolate connections, bind manifest v3 to the exact public-table catalog/accounting profile and verify synthetic restores; no real backup was taken | External schedule and deletion process unverified | Owner/accountant/privacy owner: approve frequency, encryption, access, restore tests and deletion reconciliation |

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

## Approval gate

Do not schedule or run either fulfilled-order anonymization pass with
`dryRun:false` until the owner and an accounting/privacy reviewer have completed
this table against real receipts and the actual bookkeeping archive. In
particular, the current 90- and 1,095-day minimum cutoffs are implementation
behavior, not evidence that the periods or selected fields are legally correct.
Do not backfill missing VAT snapshots from current code; use original evidence
and a documented accountant-approved correction process.
