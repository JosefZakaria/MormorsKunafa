# Vercel deployment prerequisites

Status 2026-09-08: future operator instructions. No deployment or live verification was performed during the security branch review. Read [the branch review](SECURITY_BRANCH_REVIEW.md) and its unresolved gates before scheduling a rollout.

## Origins and environment isolation

The web bundle always uses same-origin `/api`; a cross-origin `VITE_API_BASE_URL` is not the production API switch because the cookie/CSRF and SSE contracts depend on the proxy. [`apps/web/vercel.mjs`](../apps/web/vercel.mjs) now generates that rewrite from Vercel's deployment environment. Production remains pinned to the reviewed Production backend. Development remains pinned to `127.0.0.1`. Preview has no fallback: configuration evaluation fails unless its target is both an explicit clean HTTPS origin and an exact member of the committed Preview allowlist.

The committed Preview allowlist is intentionally empty. No isolated test backend was available to approve during this local work, so **every Preview build is currently expected to fail closed**. Vercel supports programmatic configuration and environment-specific variables, but those controls do not prove what database or providers are behind a hostname. See Vercel's [programmatic configuration](https://vercel.com/docs/project-configuration/vercel-ts), [environment-variable scoping](https://vercel.com/docs/environment-variables/manage-across-environments), and [deployment environments](https://vercel.com/docs/deployments/environments).

| App | Vercel root | Output |
| --- | --- | --- |
| Web | `apps/web` | `dist` |
| Backend | `backend` | Leave output override off; use `backend/vercel.json` |

Before enabling one exact Preview origin:

1. Provision a backend that uses only a separate synthetic/test database, separate Upstash, test merchant/provider resources and non-Production notification settings. Do not copy `.env` or Production values.
2. Record evidence for the backend project/deployment identity and every resource binding. Confirm that none of its aliases or redirects reaches the Production backend.
3. Add only that exact clean HTTPS origin to `APPROVED_PREVIEW_API_ORIGINS` in `apps/web/config/vercel-config.mjs` and review the code change. The value must be an origin only, without `/api`, credentials, query or fragment.
4. Set the same value as `PREVIEW_API_ORIGIN` in the web project's **Preview environment only**. Populate Preview-scoped `PRODUCTION_API_ORIGINS` with every current Production API alias as an additional denylist; the repository already denies the known Vercel and custom API aliases.
5. Configure the isolated backend's `PUBLIC_WEB_APP_URL`, `FRONTEND_URL`/`FRONTEND_URLS`, secrets and provider modes for the exact Preview web origin. A payment return to the Production site is not an acceptable Preview configuration.
6. Run `npm run verify:web-deployment`, then use a pinned current Vercel CLI to compile both Production and Preview configuration locally and inspect the generated `/api` destination before any authorized deployment.

Vercel Git integration can create a Preview from a push to a non-Production branch or from a pull request. Treat the first push/PR as a possible deployment trigger: inspect the project's Git/deployment settings and complete the steps above first. Do not promote a Preview artifact to Production; the external rewrite is generated when that artifact's config is compiled, so create and inspect a fresh Production build from the same reviewed commit instead.

For local integrated verification use [LOCAL_SECURITY_TESTS.md](LOCAL_SECURITY_TESTS.md). The harness discards inherited credentials, starts its own localhost database and simulates providers. Ordinary `dev` commands load local configuration and are not substitutes for the isolated harness.

Review backend settings individually in the appropriate private environment: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, strong independent `JWT_SECRET`, status-token configuration, `CRON_SECRET`, Upstash settings, Stripe secrets and `REFUND_PASSWORD_HASH`. Consult `backend/.env.example` for names and constraints; never commit values. Email/SMS/push/Swish settings must belong to the intended environment and merchant.

Explicitly set `PUBLIC_WEB_APP_URL` to the web origin for payment returns. The code chooses `PUBLIC_WEB_APP_URL`, then `FRONTEND_URL`, then `SITE_PUBLIC_URL`; production falls back to the configured public site, development to localhost. An implicit fallback is not evidence of correct deployment configuration. Review the CORS allowlist separately. `VITE_STRIPE_PUBLIC_KEY` is not used by the server-hosted Checkout flow.

## Database and version transition

Choose the migration track from the actual applied ledger and checksums; never use filename sorting. `migration-order.json` is for an empty/fresh installation. A database already served by main must use the four phases in `legacy-transition-order.json`. Take a verified backup and rehearse every pending complementary migration against an independently isolated restore. Never rerun or falsely mark an old migration. Detailed commands, lock/grant checks, web-first ordering and recovery boundaries are in [LEGACY_CHECKOUT_TRANSITION.md](LEGACY_CHECKOUT_TRANSITION.md) and the [migration README](../backend/src/db/migrations/README.md).

The Phase 1 trigger gives legacy `MAX` inserts and the atomic RPC one shared sequence while the old backend stays usable. Deploy the dual-contract web before the guarded backend; then cached mutation requests fail before writes with `CLIENT_UPGRADE_REQUIRED` and a reload instruction. Apply positive-total/item constraints only after every old writer and alias is proven drained. Missing legacy status capabilities lead to help, not public order data. Raw main is not a valid rollback after finalization.

## Verification after an independently authorized rollout

1. Production `/api/health` should return `200 {"ok":true,"status":"healthy"}`; a missing database configuration yields `503 {"ok":false,"status":"unhealthy"}`. Diagnostic flags such as `jwtConfigured` are intentionally absent in production. Health only checks configuration presence; it does not prove database reachability, merchant credentials or webhook delivery.
2. Verify the public catalogue through the web origin, both locations, server prices, hidden products, location stock, schedules, delivery fee and owner/scoped-admin access.
3. Verify cookie login, CSRF, session revocation, private responses and SSE through the same-origin proxy. Observe real hosted headers; local configuration checks are not live evidence.
4. Reconcile payments that started before the version change, delayed webhooks, refunds and duplicate payment alerts. Stripe events include `checkout.session.completed`, `refund.created`, `refund.updated`, `refund.failed`. A busy webhook lease deliberately returns retryable `503`, not an acknowledgment that processing finished.
5. The daily cleanup makes never-initiated unpaid drafts eligible after **24 hours** (normally removed at 24–48 hours with the daily schedule). Initiated drafts require canonical provider reconciliation. Open, unknown or mismatched payments remain retained. Retention also preserves unresolved financial evidence, pending refunds and legal holds. Verify dry-run aggregates before enabling execution.
6. Confirm email/SMS/push delivery independently. Paid state is atomic; delivery side effects are not a durable outbox and are not guaranteed exactly once. Staff must have a verified order-queue fallback.

## Recovery

Follow the branch report's forward-repair/compatible-build procedure. Never restore a pre-cutover full backup over a database receiving real orders. Preserve new order, payment, refund, provider-event and audit records; keep reconciliation running. Reverting blindly to old main can break numbering and the new authentication/status contract.

`npm run verify:web-deployment`, `npm run verify:web-build` and `npm run check` verify repository/build behavior only. The deployment verifier executes allowed and denied environment/target combinations, including the currently empty committed Preview allowlist. These checks do not authorize deployment, prove hosted resource ownership, or discharge the remaining provider/operational gates.
