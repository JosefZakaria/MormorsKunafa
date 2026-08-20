# Backend

Express API for Mormors Kunafa: products, orders, and admin (JWT). Data is stored in **Supabase**; prices in öre.

## Environment variables

Copy `backend/.env.example` to `backend/.env` and fill in values. For Vercel, set the same variables in the project dashboard (see `Docs/VERCEL_DEPLOY.md`).

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
| `STRIPE_WEBHOOK_SECRET` | Signing secret (`whsec_`) from the **live** webhook endpoint (not test CLI) |
| `PUBLIC_WEB_APP_URL` | Storefront URL for Checkout `success_url` / `cancel_url` (no trailing slash), e.g. `https://mormorskunafa.se` |
| `FRONTEND_URL` | Also used for CORS; should match the live storefront |

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
See [docs/STRIPE_GO_LIVE.md](../docs/STRIPE_GO_LIVE.md) and `backend/.env.example`.

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
   npm install
   ```

2. **Configure a Supabase project** with `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` in the private environment.

   Database migrations are PostgreSQL files under `src/db/migrations`. The app
   never applies them automatically. Follow that directory's README: create and
   restore-test a full external backup, test in staging, use the approved night
   maintenance window and verify accounting aggregates before reopening writes.
   Never run a migration merely to make a local build pass.

3. **Start the server**

   ```bash
   npm run dev --workspace=@mormors-kunafa/backend
   ```

   API base URL: `http://localhost:3001/api` (or `PORT` you set).

## Admin PWA Notifications

1. Apply SQL migration in Supabase SQL editor:

   - `backend/src/db/migrations/2026-06-06-admin-pwa-notifications.sql`

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

   - New order emits SSE event (`/api/admin/events`) for foreground sync.
   - Push notification is sent for background/stängd app.

## Web app and API URL

The shared API config defaults to `http://localhost:3000/api`. To use this backend (e.g. on port 3001), either:

- Run the backend on port 3000 (`PORT=3000`), or
- Set the web app env (e.g. in `apps/web/.env`):  
  `VITE_API_BASE_URL=http://localhost:3001/api`  
  (The shared helper reads `API_BASE_URL` / `VITE_API_BASE_URL`.)

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with `tsx watch` (development) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run `node dist/index.js` (production) |

## API overview

- **Products**: `GET /api/products`, `GET /api/products/:id`, `PATCH /api/products/:id/stock` (admin).
- **Orders**: `POST /api/orders`, `GET /api/orders/:id`; admin: `GET /api/orders/admin/active`, `/api/orders/admin/pre-orders`, `/api/orders/admin/history`, `PATCH /api/orders/admin/:id/status`, `PATCH /api/orders/admin/:id/time`.
- **Admin**: `POST /api/admin/login` (returns `{ token, admin }`), `GET/PATCH /api/admin/settings`, `GET /api/admin/notifications`, `PATCH /api/admin/notifications/:id/read` (notifications stubbed).
- **Admin Notifications**:
   - `GET /api/admin/events?token=<jwt>` (SSE realtime stream)
   - `GET /api/admin/push-subscriptions`
   - `POST /api/admin/push-subscriptions`
   - `DELETE /api/admin/push-subscriptions/:id`
   - `GET /api/admin/notifications/health`

Admin routes require header: `Authorization: Bearer <token>`.
