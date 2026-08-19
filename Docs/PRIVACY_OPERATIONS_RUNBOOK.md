# Privacy operations runbook

Status: executable draft, 2026-08-19  
The business owner is the primary internal owner for rights requests, incidents,
legal holds, backup decisions and paper destruction. A backup person, restricted
journal location and production verification still must be assigned before this
runbook is considered fully operational in production. Personal owner names are
not published on the website; the company remains the public data controller.

Authoritative guidance:

- [IMY: rights requests, identification and time limits](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/de-registrerades-rattigheter/)
- [IMY: proportionate identification](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/de-registrerades-rattigheter/identifiering/)
- [IMY: personal-data incident handling](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/personuppgiftsincidenter/hantering-av-personuppgiftsincidenter/)
- [IMY incident submission](https://e-tjanster.imy.se/report)

## Rights request (DSAR) procedure

1. Record receipt time, request type, contact channel and an internal case ID.
   Never paste the request or identity evidence into source control or ordinary
   application logs.
2. Set the normal response deadline to one month from receipt. If complexity
   requires an extension, notify the requester within that first month, state
   the reason and record the decision; do not assume an extension automatically.
3. Verify identity proportionately. Start with information already used in the
   relationship (for example the requesting email/phone plus an order number).
   Do not demand an ID document by default and never retain a copy merely for
   convenience. Escalate ambiguity rather than disclosing another customer's data.
4. Search the systems in `PRIVACY_DATA_MAP.md`: Supabase orders/refunds/audit
   metadata, provider references, Resend/Sinch logs where contractually available,
   push subscriptions and any paper still retained. Search by normalized exact
   contact value; do not use broad exports on a shared workstation.
5. Have a second authorized person verify subject match, scope, exemptions and
   redaction before disclosure, correction, restriction or deletion.
6. Deliver through a channel appropriate to the data sensitivity. Do not send a
   raw database dump, credentials, other customers' data, internal secrets or
   third-party personal data. Record what was delivered and when.
7. For erasure, separate erasable operational contact/address data from records
   subject to an independently verified legal retention requirement. Record each
   retained category, reason and planned deletion date in the case.
8. Close the case only after downstream recipients have been considered and the
   requester has received a clear response. Keep only the minimum case evidence
   required for accountability under the approved case-retention policy.

## Personal-data incident procedure

1. Contain first: revoke exposed credentials, restrict access, preserve relevant
   evidence and avoid destructive history rewriting until secrets are rotated.
2. Start the incident record immediately with discovery time, reporter, systems,
   suspected interval, data categories, approximate people/records affected,
   confidentiality/integrity/availability impact and containment actions.
3. Assign an incident lead and a privacy decision owner. Record every material
   timestamp and evidence source; do not put leaked personal data into the journal.
4. Assess likelihood and severity for affected people. Document the reasoning
   even if the conclusion is that notification is not required.
5. If notification to IMY is required, submit without undue delay and, where
   possible, within 72 hours after awareness. Submit available facts rather than
   waiting for perfection, track promised supplements, and explain any delay.
6. If high risk to affected people is likely, prepare clear direct communication
   without undue delay: what happened, likely consequences, measures taken,
   practical protective steps and a contact point.
7. Preserve the final decision, corrective actions and follow-up owners. Run a
   post-incident review and update controls, the data map and this runbook.

## Backup and restore routine

1. Assign an owner and document Supabase/Vercel/provider backup scope, region,
   encryption, retention and deletion behavior from contractual evidence.
2. Use least-privilege access and MFA where available. Never download production
   backups into the repository, ordinary cloud drives or unmanaged workstations.
3. Perform a scheduled staging restore test at least annually and after material
   schema/backup changes. Record date, backup identifier, operator, duration,
   integrity checks and whether RLS/constraints/audit protections survived.
4. A restore must not silently resurrect data whose erasure period has elapsed.
   Re-run approved deletion/anonymization jobs and document reconciliation.

## Kitchen paper and printer routine

1. Place the printer in a staff-only area and restrict its network/configuration
   to authorized admin devices.
2. Collect every ticket promptly. Keep it face-down or in a closed holder while
   it is operationally needed; never use order tickets as informal long-term logs.
3. Destroy tickets securely immediately after preparation/handover/reconciliation
   no longer requires them, using a cross-cut shredder or contracted confidential
   waste process. Ordinary open recycling is not acceptable for visible PII.
4. At closing, check printer/output areas for abandoned tickets. Record and assess
   any lost or publicly exposed ticket as a possible personal-data incident.
5. Do not photograph tickets or copy their contents to private messaging apps.

## Manual fields required before final production approval

- named backup owner for DSAR and incidents (primary role: business owner);
- secure case/journal storage location and access list;
- approved case-evidence retention period;
- verified accounting archive and destruction schedule after the statutory period;
- provider contract/region/subprocessor evidence;
- backup retention and restore-test schedule;
- paper destruction method and responsible closing-role.

## Fulfilled-order tiered retention

The versioned database migration and maintenance API support a dry-run-first,
bounded, dry-run-first process. The approved application intervals are 90 days
for operational details and 1,095 days for contact data. The process remains
unscheduled until staging verification and a restricted execution journal exist.

1. Confirm that no dispute, incident, DSAR or other legal hold applies. Set the
   order's `operational_pii_legal_hold` flag when a hold is required.
2. Call `POST /api/internal/maintenance/operational-order-pii-retention` with the
   rotated maintenance bearer secret and
   `{"scope":"operational_details","limit":100,"dryRun":true}`.
3. Review only the returned internal order IDs, order numbers, states and
   terminal timestamps. Do not export customer data for the review.
4. Record the fixed scope, cutoff, owner, candidate count and rollback decision
   in the restricted journal, then repeat the same bounded request with
   `dryRun: false`.
5. Repeat steps 2–4 with `scope` set to `customer_contact`. This second pass uses
   the fixed 1,095-day period; it must not be substituted for the 90-day pass.
6. Retain the immutable audit results and run the read-only database verification.

Both passes preserve order numbers, product/quantity/price/VAT snapshots,
payment-provider identifiers and refund ledgers. The 90-day pass removes
delivery data, internal/cancellation free text, item modification text and
customer status credentials. The 1,095-day pass anonymizes name, phone and email
and catches older operational details if the shorter pass was missed. Restoring
a backup can reintroduce erased PII; after a restore, rerun both approved scopes
and document the reconciliation.
