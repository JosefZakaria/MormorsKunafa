# Vercel deployment prerequisites

Status 2026-09-11: **local preparation only; this deployment runbook is inactive**. [LOCAL_GOAL_OBJECTIVE.md](LOCAL_GOAL_OBJECTIVE.md) supersedes the earlier permission for isolated Preview work. Do not access Vercel or other provider accounts, attempt/request a login, create hosted resources, push, publish a PR, deploy to Preview or Production, merge, integrate changed main or access Production. No deployment or hosted verification has been performed. The current deliverable is a tested, committed local candidate and a report for the owner. Every external step below requires a new explicit owner instruction after its purpose and consequences have been explained; read [the release journal](RELEASE_JOURNAL_2026-09-11.md) for the remaining decisions.

## Origins and environment isolation

The web bundle always uses same-origin `/api`; a cross-origin `VITE_API_BASE_URL` is not the production API switch because the cookie/CSRF and SSE contracts depend on the proxy. [`apps/web/vercel.mjs`](../apps/web/vercel.mjs) now generates that rewrite from Vercel's deployment environment. Production remains pinned to the reviewed Production backend. Development remains pinned to `127.0.0.1`. Preview has no fallback: configuration evaluation fails unless its target is both an explicit clean HTTPS origin and an exact member of the committed Preview allowlist.

The committed Preview allowlist is intentionally empty. No isolated test backend was available to approve during this local work, so **every Preview build is currently expected to fail closed**. Vercel supports programmatic configuration and environment-specific variables, but those controls do not prove what database or providers are behind a hostname. See Vercel's [programmatic configuration](https://vercel.com/docs/project-configuration/vercel-ts), [environment-variable scoping](https://vercel.com/docs/environment-variables/manage-across-environments), and [deployment environments](https://vercel.com/docs/deployments/environments).

| App | Vercel root | Output |
| --- | --- | --- |
| Web | `apps/web` | `dist` |
| Backend | `backend` | Leave output override off; use `backend/vercel.json` |

For a future, separately authorized hosted stage, before enabling one exact Preview origin:

1. Provision a backend that uses only a separate synthetic/test database, separate Upstash, test merchant/provider resources and non-Production notification settings. Do not copy `.env` or Production values.
2. Record evidence for the backend project/deployment identity and every resource binding. Confirm that none of its aliases or redirects reaches the Production backend.
3. Add only that exact clean HTTPS origin to `APPROVED_PREVIEW_API_ORIGINS` in `apps/web/config/vercel-config.mjs` and review the code change. The value must be an origin only, without `/api`, credentials, query or fragment.
4. Set the same value as `PREVIEW_API_ORIGIN` in the web project's **Preview environment only**. Populate Preview-scoped `PRODUCTION_API_ORIGINS` with every current Production API alias as an additional denylist; the repository already denies the known Vercel and custom API aliases.
5. Configure the isolated backend's `PUBLIC_WEB_APP_URL`, `FRONTEND_URL`/`FRONTEND_URLS`, secrets and provider modes for the exact Preview web origin. A payment return to the Production site is not an acceptable Preview configuration.
6. Run `npm run verify:web-deployment`, then use a pinned current Vercel CLI to compile both Production and Preview configuration locally and inspect the generated `/api` destination before any authorized deployment.

Vercel Git integration can create a Preview from a push to a non-Production branch or from a pull request. This is why push and PR publication are prohibited in the local stage. After a new explicit owner instruction for a future external stage, inspect the project's Git/deployment settings and complete the steps above before the first authorized push/PR. Do not promote a Preview artifact to Production; its external rewrite was fixed when its configuration was compiled. Any Production rollout would need separate authorization and a freshly inspected Production build from the reviewed commit.

For local integrated verification use [LOCAL_SECURITY_TESTS.md](LOCAL_SECURITY_TESTS.md). The harness discards inherited credentials, starts its own localhost database and simulates providers. Ordinary `dev` commands load local configuration and are not substitutes for the isolated harness.

In a future authorized hosted stage, review backend settings individually in the appropriate private environment: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, strong independent `JWT_SECRET`, `ORDER_STATUS_TOKEN_SECRET`, `CRON_SECRET`, Upstash settings, Stripe test secrets and `REFUND_PASSWORD_HASH`. Consult `backend/.env.example` locally for names and constraints; never commit values. Preview requires a separate status-token key: new v2 tokens use it, while existing v1 tokens retain the prior JWT signature and stored hash/expiry. Preserve the prior JWT key during this compatible transition. The web accepts both exact token formats.

This candidate offers card checkout only. Set `SWISH_CHECKOUT_ENABLED=false` and configure no Swish certificates or merchant credentials. The flag blocks new checkout; historical provider reconciliation/refunds remain supported in code. Leave email, SMS and push credentials absent. Those channels are outside this candidate; verify the persistent location-scoped queue and SSE/reload recovery with all channels disabled.

Preview requires an explicit clean HTTPS `PUBLIC_WEB_APP_URL` and has no production fallback. Its CORS origins come only from explicit frontend configuration; known Production web origins are rejected. Set `PRODUCTION_WEB_ORIGINS` to any additional verified Production aliases for this denylist. Outside Preview, the existing `PUBLIC_WEB_APP_URL`, `FRONTEND_URL`, `SITE_PUBLIC_URL` precedence remains. `VITE_STRIPE_PUBLIC_KEY` is not used by the server-hosted Checkout flow. Preview rejects live Stripe keys, events and Checkout sessions.

## Future database and version transition — inactive

Do not connect to Production, including for metadata, in the local stage. These migration and rollout procedures require separate explicit authorization. Current verification uses only newly created local databases and synthetic fixtures.

Choose the migration track from the actual applied ledger and checksums; never use filename sorting. `migration-order.json` is for an empty/fresh installation. A database already served by main must use the four phases in `legacy-transition-order.json`. Take a verified backup and rehearse every pending complementary migration against an independently isolated restore. Never rerun or falsely mark an old migration. Detailed commands, lock/grant checks, web-first ordering and recovery boundaries are in [LEGACY_CHECKOUT_TRANSITION.md](LEGACY_CHECKOUT_TRANSITION.md) and the [migration README](../backend/src/db/migrations/README.md).

The Phase 1 trigger gives legacy `MAX` inserts and the atomic RPC one shared sequence while the old backend stays usable. Deploy the guarded backend first during the separately approved fail-closed checkout window; cached mutation requests fail before writes with `CLIENT_UPGRADE_REQUIRED`. Deploy the current web only after all API origins use that guard. The web refuses to start payment from a legacy or ambiguous create response. Apply positive-total/item constraints only after every old writer and alias is proven drained. Missing legacy status capabilities lead to help, not public order data. Raw main is not a valid rollback after finalization.

Local backup/security commit `eb2cd50` (nine files, +485/-12) adds public-only ACL-preserving archives and metadata verification including column privileges and grant options. The reproduced column-only refund mutation bypass is fixed and regression-tested. The new 146-line `scripts/test-backup-restore.mjs` passed in 85.8 seconds against independent local clusters, comparing one order, one item, 100 öre paid gross and one audit event while preserving the target Storage sentinel and expected permissions. The operator status proves the archive/profile, internal consistency and selected security metadata; the fixture's bounded equality is not a full hosted financial A=B comparison or a Production backup. See [the preservation matrix](ACCOUNTING_DATA_PRESERVATION.md) for the remaining evidence requirements.

## Future isolated Preview verification — inactive

1. The verified Preview `/api/health` should return `200 {"ok":true,"status":"healthy"}`; a missing database configuration yields `503 {"ok":false,"status":"unhealthy"}`. Health only checks configuration presence; it does not prove database reachability, provider isolation or webhook delivery. Do not probe Production as part of this procedure.
2. Verify the public catalogue through the web origin, both locations, server prices, hidden products, location stock, schedules, delivery fee and owner/scoped-admin access.
3. Verify cookie login, CSRF, session revocation, private responses and SSE through the same-origin proxy. Observe real hosted headers; local configuration checks are not live evidence.
4. Reconcile payments that started before the version change, delayed webhooks, refunds and duplicate payment alerts. Stripe events include `checkout.session.completed`, `refund.created`, `refund.updated`, `refund.failed`. A busy webhook lease deliberately returns retryable `503`, not an acknowledgment that processing finished.
5. The daily cleanup makes never-initiated unpaid drafts eligible after **24 hours** (normally removed at 24–48 hours with the daily schedule). Initiated drafts require canonical provider reconciliation. Open, unknown or mismatched payments remain retained. Retention also preserves unresolved financial evidence, pending refunds and legal holds. Verify dry-run aggregates before enabling execution.
6. Keep email/SMS/push credentials absent and verify that the paid order persists in the correct location's PostgreSQL queue. Test SSE reconnect, reload and notification failure without changing payment status. External delivery is outside this candidate; staffing still requires an explicit business decision.

## Future recovery procedure — inactive

Follow the branch report's forward-repair/compatible-build procedure. Never restore a pre-cutover full backup over a database receiving real orders. Preserve new order, payment, refund, provider-event and audit records; keep reconciliation running. Reverting blindly to old main can break numbering and the new authentication/status contract.

`npm run verify:web-deployment`, `npm run verify:web-build` and `npm run check` verify repository/build behavior only. The deployment verifier executes allowed and denied environment/target combinations, including the currently empty committed Preview allowlist. These checks do not authorize deployment, prove hosted resource ownership, or discharge the remaining provider/operational gates.
