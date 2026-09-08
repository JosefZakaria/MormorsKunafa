# Vercel deployment prerequisites

Status 2026-09-08: future operator instructions. No deployment or live verification was performed during the security branch review. Read [the branch review](SECURITY_BRANCH_REVIEW.md) and its unresolved gates before scheduling a rollout.

## Origins and environment isolation

The production web bundle uses same-origin `/api`. `apps/web/vercel.json` proxies that path to the backend. A cross-origin `VITE_API_BASE_URL` is not the production API switch; the cookie/CSRF contract depends on the same-origin proxy. The current rewrite names the production backend and also applies to ordinary Preview deployments. **Do not deploy or use a Preview until its rewrite and all backend integrations point exclusively at isolated test resources.** Do not copy a local `.env` or Production values into Preview.

| App | Vercel root | Output |
| --- | --- | --- |
| Web | `apps/web` | `dist` |
| Backend | `backend` | Leave output override off; use `backend/vercel.json` |

For local integrated verification use [LOCAL_SECURITY_TESTS.md](LOCAL_SECURITY_TESTS.md). The harness discards inherited credentials, starts its own localhost database and simulates providers. Ordinary `dev` commands load local configuration and are not substitutes for the isolated harness.

Review backend settings individually in the appropriate private environment: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, strong independent `JWT_SECRET`, status-token configuration, `CRON_SECRET`, Upstash settings, Stripe secrets and `REFUND_PASSWORD_HASH`. Consult `backend/.env.example` for names and constraints; never commit values. Email/SMS/push/Swish settings must belong to the intended environment and merchant.

Explicitly set `PUBLIC_WEB_APP_URL` to the web origin for payment returns. The code chooses `PUBLIC_WEB_APP_URL`, then `FRONTEND_URL`, then `SITE_PUBLIC_URL`; production falls back to the configured public site, development to localhost. An implicit fallback is not evidence of correct deployment configuration. Review the CORS allowlist separately. `VITE_STRIPE_PUBLIC_KEY` is not used by the server-hosted Checkout flow.

## Database and version transition

Use `backend/src/db/migrations/migration-order.json`, **not filename sorting**. Compare the actual applied ledger and checksums, take a verified backup, and rehearse pending complementary migrations against an independently isolated restore before production execution. Never rerun old sequence/role initializers. Detailed lock, grant and sequence constraints are in [the migration README](../backend/src/db/migrations/README.md).

Old `MAX` order-number writers cannot overlap the sequence-based writer. Old customers may lack the new status capability, idempotency header or required location. A compatible cutover/drain/reload plan must be proven before enabling the new versions; never restore public customer data or weak authentication to accommodate old clients. The owner's existing preference to keep checkout open has not been replaced by permission to pause it. If the transition cannot satisfy that constraint, deployment remains blocked.

## Verification after an independently authorized rollout

1. Production `/api/health` should return `200 {"ok":true,"status":"healthy"}`; a missing database configuration yields `503 {"ok":false,"status":"unhealthy"}`. Diagnostic flags such as `jwtConfigured` are intentionally absent in production. Health only checks configuration presence; it does not prove database reachability, merchant credentials or webhook delivery.
2. Verify the public catalogue through the web origin, both locations, server prices, hidden products, location stock, schedules, delivery fee and owner/scoped-admin access.
3. Verify cookie login, CSRF, session revocation, private responses and SSE through the same-origin proxy. Observe real hosted headers; local configuration checks are not live evidence.
4. Reconcile payments that started before the version change, delayed webhooks, refunds and duplicate payment alerts. Stripe events include `checkout.session.completed`, `refund.created`, `refund.updated`, `refund.failed`. A busy webhook lease deliberately returns retryable `503`, not an acknowledgment that processing finished.
5. The daily cleanup makes never-initiated unpaid drafts eligible after **24 hours** (normally removed at 24–48 hours with the daily schedule). Initiated drafts require canonical provider reconciliation. Open, unknown or mismatched payments remain retained. Retention also preserves unresolved financial evidence, pending refunds and legal holds. Verify dry-run aggregates before enabling execution.
6. Confirm email/SMS/push delivery independently. Paid state is atomic; delivery side effects are not a durable outbox and are not guaranteed exactly once. Staff must have a verified order-queue fallback.

## Recovery

Follow the branch report's forward-repair/compatible-build procedure. Never restore a pre-cutover full backup over a database receiving real orders. Preserve new order, payment, refund, provider-event and audit records; keep reconciliation running. Reverting blindly to old main can break numbering and the new authentication/status contract.

`npm run verify:web-deployment`, `npm run verify:web-build` and `npm run check` verify repository/build behavior only. They do not authorize deployment, prove hosted configuration, or discharge the remaining provider/operational gates.
