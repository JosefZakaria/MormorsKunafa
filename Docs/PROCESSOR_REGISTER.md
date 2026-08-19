# Provider and recipient register

Status: operational draft based on current code, 2026-08-19  
Owner, contract evidence and annual review date: **must be assigned manually**

This is the working vendor register. A service must not be marked contractually
verified until its signed terms/DPA, production region, retention configuration,
international-transfer mechanism and current subprocessor list have been saved
with the internal compliance record.

The dated public-source review is in
`Docs/PROCESSOR_EVIDENCE_2026-08-19.md`. It establishes what providers publish,
not what is enabled or contractually applicable to the production accounts.

| Service/recipient | Code-verified purpose and disclosed data | Expected role (verify legally) | Required evidence still open |
| --- | --- | --- | --- |
| Supabase | Primary application database: orders/contact/address, products, admins, push subscriptions, audit/payment/refund metadata | Processor | Project region, DPA, backup/log retention, subprocessor list, production RLS verification |
| Vercel | Hosts web/backend and receives network/runtime metadata | Processor | Commercial plan, DPA, EU execution region, training opt-out, log retention, subprocessors |
| Upstash | Rate-limit counters containing hashed identifiers | Processor | Region, DPA, retention/eviction, subprocessors |
| Resend | Recipient email, customer name, order/receipt content | Processor | DPA, sending/log region, message/log retention, subprocessors, transfer mechanism |
| Google Gmail | Customer-service, complaint, privacy-request and private security-report email sent to the public contact address | Account type and controller/processor role must be verified | Confirm consumer Gmail vs managed Workspace, applicable terms/DPA, transfers, retention/deletion, recovery owner and two-step verification; do not assume the Workspace DPA applies to an `@gmail.com` account |
| Sinch | Phone number, bounded transactional SMS text | Processor for instructed activity; public DPA states independent-controller activity for parts of communications delivery | DPA, contracting entity, confirmed EU Conversation API project/region, role split, log retention, subprocessors |
| Stripe | Customer email, server-created line items/amount, order ID metadata, payment/refund identifiers | Processor/controller role varies by Stripe activity | Current services agreement/DPA, product-specific role statement, transfer safeguards, retention, subprocessors |
| Swish/connected bank | Phone alias, amount, currency, order reference and payment/refund identifiers over mTLS | Bank/controller and provider/recipient chain must follow the merchant agreement | Merchant agreement, role statement, retention and recipient chain |
| Web Push providers | Admin push endpoint/keys and paid-order notification payload | Recipient/processor depends on browser endpoint | Identify enrolled endpoint providers, privacy terms, retention; reset unknown subscriptions |
| Local Epson printer | Minimum operational order and delivery fields printed in the kitchen | Internal recipient/device | Physical access owner, paper destruction routine, device/network inventory |
| GitHub | Source code and CI metadata; must contain no production personal data or secrets | Processor for repository data | Repository visibility, secret scanning, incident/history cleanup, organization security settings |

## Onboarding gate for a new provider

Before production use, record all of the following:

1. business purpose and necessity;
2. exact fields sent and whether a less identifying value works;
3. controller/processor/recipient role approved by the responsible person;
4. signed agreement/DPA and current subprocessor list;
5. regions, international-transfer mechanism and supplementary safeguards;
6. provider and application retention/deletion behavior;
7. incident notification contact and contractual deadline;
8. least-privilege credentials, rotation owner and offboarding procedure;
9. staging verification and an update to the privacy notice/data map.

No blank item may be silently interpreted as approved.
