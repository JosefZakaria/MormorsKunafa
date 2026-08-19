# Privacy data map

Status: code-verified inventory, 2026-08-19  
Scope: current web, backend, database and kitchen-print flows

This inventory describes what the current code sends. It does not prove a
provider's production region, contract, log retention or subprocessor list;
those items remain explicitly open in `PROCESSOR_REGISTER.md`.

Public provider material reviewed on 2026-08-19 is indexed in
`PROCESSOR_EVIDENCE_2026-08-19.md`. Account-specific confirmation remains
mandatory because public DPA availability does not prove the production plan,
region, accepted version or configured retention.

## Customer and order flows

| Data category | Source | Internal storage/use | External recipient | Code-verified minimization |
| --- | --- | --- | --- | --- |
| Name | Checkout | `orders.customer_name`; authenticated admin; email/SMS greeting; kitchen ticket when operationally needed | Resend; Sinch; local printer | Stored once in the order columns; not duplicated in `delivery_info_json`; bounded and control-character filtered |
| Phone | Checkout | `orders.customer_phone`; authenticated admin; Swish payer alias; SMS; delivery ticket | Sinch; Swish; local printer for delivery | Bounded and normalized; absent from public order DTO and ordinary logs |
| Email | Checkout | `orders.customer_email`; authenticated admin; confirmation email; Stripe customer email | Resend; Stripe | Optional; absent from public DTO, push payload and kitchen ticket |
| Delivery address/postcode/city | Checkout for delivery only | `orders.delivery_info_json`; authenticated admin; delivery ticket | Local printer | Object contains delivery fields only, not a second copy of name/phone/email |
| Products, variants, quantity and price | Server catalogue + checkout choice | `order_items`; admin; receipt/email; kitchen ticket | Stripe line items; Resend; local printer | Price/name are resolved and snapshotted by the server; public status DTO does not expose the basket |
| Order number, status and schedule | Backend | `orders`; admin; minimized customer status page | Resend; Sinch; authenticated Web Push | Push contains internal order ID/number only and is sent only for verified paid orders |
| Payment identifiers/status | Stripe/Swish | `orders`, `payment_provider_events`, refund ledger | Stripe or Swish | Provider payloads and card/bank credentials are not stored; immutable IDs and bounded outcomes only |
| Refund selection/status | Admin | `order_refunds`, `order_refund_items`, audit log | Stripe or Swish | Dedicated authorization; item quantities and provider IDs only; no password plaintext stored |
| Customer-service, complaint and privacy messages | Customer by email | Gmail mailbox controlled by the business owner | Google Gmail | Public address is explicit; messages must not be copied into source control or ordinary application logs |

## Admin, device and security flows

| Data category | Storage/recipient | Purpose | Controls |
| --- | --- | --- | --- |
| Admin identity and password hash | Supabase | Authentication and authorization | bcrypt hash; active flag; token version; short sessions; audit trail |
| Admin session | First-party cookies | Authenticated administration | HttpOnly session cookie, SameSite Strict, CSRF cookie, 30-minute lifetime |
| Push endpoint, encryption keys, user agent | Supabase and the endpoint's push provider | Deliver paid-order alerts to enrolled admin devices | Authenticated registration; origin/IP checks; bounded fields; removable/disableable subscription |
| IP-derived abuse key | Upstash | Distributed rate limiting | Contact values and compound identifiers are HMAC-hashed before use; no request body is used as a key |
| Admin/security events | Supabase immutable audit log | Accountability and incident investigation | Route template and internal resource ID only; no request body; login email is HMAC-hashed |
| Provider webhook events | Supabase | Replay protection and reconciliation | Event ID/type/mode/outcome/order ID only; no provider payload |
| Runtime logs | Vercel/runtime | Operations and security | Safe bounded metadata; no raw provider body, credential, customer contact field or stack in controlled log helpers |

## Paper and local-device flow

The kitchen printer receives only the fields needed to prepare or hand over the
order. Email is excluded. A non-delivery kitchen ticket contains order number,
type, schedule, products/modifications and customer name when needed. A delivery
ticket additionally contains delivery address and phone. Printer text is stripped
of ESC/POS, terminal and multiline control characters before XML construction.

Paper has no technical deletion control. The operational runbook therefore
requires collection from the printer, locked access while needed, and secure
destruction immediately after the service/reconciliation purpose ends.

## Browser and public API

The complete first-party browser-storage inventory and lifetimes are in
`BROWSER_STORAGE.md`. The unauthenticated order-status API requires a random,
revocable, order-bound token and returns only order number, status and approximate
ready time with `Cache-Control: private, no-store`.

## Tiered order retention

Accounting-relevant order data and operational contact/address fields currently
share the same `orders` row. Abandoned drafts have automated provider-aware
cleanup. The versioned fulfilled-order migration separately removes delivery
data, operational/free-text notes, item modifications and customer status
credentials after 90 days, then anonymizes name, phone and email after 1,095
days. A per-order legal hold pauses both passes. Order numbers, item/price/VAT
snapshots, payment/provider identifiers and refund ledgers are preserved for
the approved accounting archive.

The three-year contact window is for customer service, complaints and disputes,
not direct marketing. Do not export it to a marketing list or reuse it for a new
purpose without a separate documented legal basis and review. Production remains
unverified until the migration, both dry runs and the security-posture queries
have passed in staging and production.
