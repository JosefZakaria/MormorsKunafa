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

Live webhook: `POST https://<backend-host>/api/stripe/webhook` with event `checkout.session.completed`.  
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

Run `npm run db:migrate:swish` after deploy to add `orders.swish_instruction_id`.

Optional, for one-time WordPress migration only:

| Variable | Description |
|----------|-------------|
| `WP_DB_DATABASE` | WordPress/WooCommerce database name |
| `WP_DB_HOST` | (optional) WP DB host; falls back to `DB_HOST` |
| `WP_DB_PORT` | (optional) WP DB port |
| `WP_DB_USER` | (optional) WP DB user |
| `WP_DB_PASSWORD` | (optional) WP DB password |
| `WP_TABLE_PREFIX` | (optional) WP table prefix; default `wp_` |

## Setup

1. **Create the app database** (e.g. in MySQL):

   ```sql
   CREATE DATABASE mormors_kunafa CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

2. **Install and run schema** (from repo root or `backend/`):

   ```bash
   npm install
   npm run db:migrate --workspace=@mormors-kunafa/backend
   ```

   This runs `backend/src/db/schema.sql` against `DB_DATABASE`.

3. **(Optional) Migrate from WordPress**

   - Restore your WordPress/WooCommerce SQL dump into a MySQL database.
   - Set `WP_DB_DATABASE` (and other `WP_DB_*` if needed) in `.env`.
   - Run:

   ```bash
   npm run db:seed-wp --workspace=@mormors-kunafa/backend
   ```

   Products and orders are copied; admin users are created with **new** bcrypt passwords. The script prints temporary passwords; change them after first login.

4. **Start the server**

   ```bash
   npm run dev --workspace=@mormors-kunafa/backend
   ```

   API base URL: `http://localhost:3001/api` (or `PORT` you set).

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
| `npm run db:migrate` | Apply `src/db/schema.sql` to `DB_DATABASE` |
| `npm run db:migrate:remove-rush-time-adjustment` | Drop `admin_settings.rush_time_adjustment_minutes` if it exists |
| `npm run db:migrate:swish` | Add `orders.swish_instruction_id` for Swish payments |
| `npm run db:seed-wp` | One-time migration from WordPress DB (requires `WP_DB_*`) |
| `npm run db:generate-product-sql` | Read WordPress dump file, output `backend/generated-products.sql` for the `products` table (no DB connection) |

### Product SQL from WordPress dump (no DB connection)

If you have the WordPress SQL dump file (e.g. `Database/845466_...sql`) but no remote DB access:

1. Run: `npm run db:generate-product-sql --workspace=@mormors-kunafa/backend`
2. Open `backend/generated-products.sql` and run its contents in phpMyAdmin on your target database to insert products.

## API overview

- **Products**: `GET /api/products`, `GET /api/products/:id`, `PATCH /api/products/:id/stock` (admin).
- **Orders**: `POST /api/orders`, `GET /api/orders/:id`; admin: `GET /api/orders/admin/active`, `/api/orders/admin/pre-orders`, `/api/orders/admin/history`, `PATCH /api/orders/admin/:id/status`, `PATCH /api/orders/admin/:id/time`.
- **Admin**: `POST /api/admin/login` (returns `{ token, admin }`), `GET/PATCH /api/admin/settings`, `GET /api/admin/notifications`, `PATCH /api/admin/notifications/:id/read` (notifications stubbed).

Admin routes require header: `Authorization: Bearer <token>`.
