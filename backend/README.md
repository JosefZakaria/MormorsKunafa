# Backend

Express API for Mormors Kunafa: products, orders, and admin (JWT). Data is stored in **Supabase**; prices in öre.

## Environment variables

For ordinary local development, copy `backend/.env.example` to a private `backend/.env` and use only isolated development resources. For the security verification, use [the isolated harness](../Docs/LOCAL_SECURITY_TESTS.md), which does not load that file. Configure each Vercel environment separately; never copy Production credentials into Preview. See [deployment prerequisites](../Docs/VERCEL_DEPLOY.md).

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server only) | Yes |
| `JWT_SECRET` | Secret for admin JWT | Yes (production) |
| `PORT` | Server port (local dev) | No (`3001`) |

Order confirmation email (Resend):

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | API key from Resend. If unset, no order email is sent. |
| `RESEND_FROM_EMAIL` | Verified sender in Resend (`onboarding@resend.dev` is the SDK default for quick tests). |
| `SITE_PUBLIC_URL` | Public site base URL **without trailing slash**, e.g. `https://example.se`. Logo in mail uses `{SITE_PUBLIC_URL}/images/logo.png` — the same path as `apps/web/public/images/logo.png` once deployed. Avoid `localhost` (mail clients cannot fetch it). |
| `ORDER_EMAIL_LOGO_URL` | Optional absolute URL to the logo image only; overrides the path built from `SITE_PUBLIC_URL`. Use a direct image link if you need to test before a public domain exists. |

Stripe (card payments):

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Secret key (`sk_test_` / `sk_live_`) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the endpoint and environment being used; sandbox, CLI and live endpoint secrets are not interchangeable |
| `PUBLIC_WEB_APP_URL` | Storefront URL for Checkout `success_url` / `cancel_url` (no trailing slash), e.g. `https://mormorskunafa.se` |
| `FRONTEND_URL` | Also used for CORS; match the storefront for the intended environment |

Admin PWA notifications (Web Push):

| Variable | Description |
|----------|-------------|
| `WEB_PUSH_SUBJECT` | Monitored contact URI for VAPID, e.g. `mailto:Mormorskunafa@gmail.com` |
| `WEB_PUSH_VAPID_PUBLIC_KEY` | Public VAPID key (shared with web app as `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`) |
| `WEB_PUSH_VAPID_PRIVATE_KEY` | Private VAPID key (server only) |

Admin refund authorization:

| Variable | Description |
|----------|-------------|
| `REFUND_PASSWORD_HASH` | Bcrypt hash with cost 10 or higher for a dedicated refund password. Store only the hash in Vercel; never commit or deploy the plaintext password. Refund routes fail closed when this is absent or malformed. |

Live webhook: `POST https://<backend-host>/api/stripe/webhook` with events
`checkout.session.completed`, `refund.created`, `refund.updated` and
`refund.failed`.
See [Stripe rollout verification](../Docs/STRIPE_GO_LIVE.md) and `.env.example`.

Swish (direct API — requires Swish Handel + bank certificates):

| Variable | Description |
|----------|-------------|
| `SWISH_ENV` | `test` (default, MSS) or `prod` |
| `SWISH_PAYEE_ALIAS` | Your merchant Swish number |
| `SWISH_CERT_PATH` | Path to PEM client certificate |
| `SWISH_KEY_PATH` | Path to PEM private key |
| `SWISH_KEY_PASSPHRASE` | Optional key passphrase |
| `SWISH_CA_PATH` | Optional CA bundle PEM |
| `SWISH_CALLBACK_BASE_URL` | Public HTTPS base URL of this API (no trailing slash), e.g. `https://api.example.se` — Swish POSTs to `{base}/api/swish/callback` |

## Setup

1. **Install dependencies** (from the repository root):

   ```bash
   npm ci --ignore-scripts
   ```

2. **Configure a Supabase project** with `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` in the private environment.

   Database migrations are PostgreSQL files under `src/db/migrations`. The app
   never applies them automatically. Follow that directory's README: compare the
   real migration ledger, create and restore-test an external backup, rehearse in
   staging and resolve the old-writer/client transition before scheduling a rollout.
   This documentation does not authorize pausing the shop or a maintenance window.
   Never run a migration merely to make a local build pass.

3. **Start the server**

   ```bash
   npm run dev --workspace=@mormors-kunafa/backend
   ```

   API base URL: `http://localhost:3001/api` (or `PORT` you set).

## Admin PWA Notifications

These are future operator steps after the branch's deployment gates are resolved.

1. Verify that `2026-06-06-admin-pwa-notifications.sql` and its later hardening
   migrations are applied in manifest order, using the actual migration ledger.
   Do not rerun an initializer solely to enable notifications.

2. Configure Web Push env vars in backend and web:

   - Backend: `WEB_PUSH_SUBJECT`, `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`
   - Web (`apps/web/.env`): `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`

3. Build/deploy backend and web over HTTPS.

4. On iPad:

   - Open site in Safari.
   - Add to Home Screen.
   - Log in to admin dashboard.
   - Press "Aktivera notiser".

5. Verify flow:

   - A paid order produces foreground sync through the authenticated SSE ticket flow.
   - Verify background push delivery to enrolled devices independently; local tests do not prove delivery.

## Web app and API URL

The production web build always uses same-origin `/api`; its Vercel rewrite must
target the matching backend environment. The shared helper's development fallback
is `http://localhost:3001/api`. For ordinary web development, set
`VITE_API_BASE_URL=/api` to use Vite's local proxy to port 3001 and exercise the
same-origin cookie/CSRF flow. The isolated browser harness sets its own explicit
test configuration. A production `VITE_API_BASE_URL` does not override `/api`.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with `tsx watch` (development) |
| `npm run build` | Remove the verified backend `dist/` target, then compile current TypeScript so deleted files cannot survive into tests or deployment |
| `npm run start` | Run `node dist/index.js` (production) |

## API overview

- **Products**: `GET /api/products`, `GET /api/products/:id`, `PATCH /api/products/:id/stock` (admin).
- **Orders**: `POST /api/orders`, `GET /api/orders/:id`; admin: `GET /api/orders/admin/active`, `/api/orders/admin/pre-orders`, `/api/orders/admin/history`, `PATCH /api/orders/admin/:id/status`, `PATCH /api/orders/admin/:id/time`.
- **Admin**: `POST /api/admin/login` (returns `{ admin }` and sets the HttpOnly session/CSRF cookies), `GET/PATCH /api/admin/settings`, `GET /api/admin/notifications`, `PATCH /api/admin/notifications/:id/read` (notifications stubbed).
- **Admin Notifications**:
   - `POST /api/admin/events/ticket`, then `GET /api/admin/events?ticket=<single-use-ticket>` (short-lived authenticated SSE ticket)
   - `GET /api/admin/push-subscriptions`
   - `POST /api/admin/push-subscriptions`
   - `DELETE /api/admin/push-subscriptions/:id`
   - `GET /api/admin/notifications/health`

Browser admin requests use same-origin session cookies; mutations also send `X-CSRF-Token`. The middleware checks current active admin, role, location scope and session version. Missing admins and unknown roles are denied. Do not put JWTs in browser storage or SSE URLs. Explicit bearer clients still need the current versioned token contract.

Deployment and old-client compatibility gates: [branch review](../Docs/SECURITY_BRANCH_REVIEW.md).
