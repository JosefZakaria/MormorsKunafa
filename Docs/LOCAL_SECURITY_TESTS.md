# Local security verification

Run `npm run check` for the application builds, unit tests and mobile typecheck.
Run `npm run test:db` for the isolated PostgreSQL checks after running
`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Setup-LocalTestDatabase.ps1`
once on Windows (the execution-policy override affects only this process).

The database runner starts a fresh PostgreSQL 17.11 cluster bound only to
127.0.0.1 on an available port, with a randomly generated local password and
the fixed database name `mk_security_test`. It never attaches to an existing
cluster. Ambient PG connection settings are discarded; application `.env`
files are not loaded. Clusters are stopped and their owned directories removed
after each run. Binaries and transient data live in the ignored `.cache` folder.

`MK_TEST_PG_BIN` can identify an already installed PostgreSQL 17.11 bin directory.
`MK_TEST_DB_HOST` and `MK_TEST_DB_NAME` are validated and only accept 127.0.0.1
and mk_security_test. No other target is permitted.

The fixture in `backend/test/fixtures` contains synthetic tables and Supabase-like
roles reconstructed from the repository. It does not prove the actual production
schema, Supabase extensions, hosted PostgREST behavior or account configuration.
Never replace it with a customer-data dump.

`npm run test:api` exercises real HTTP handlers and SQL through a deliberately
small local PostgREST adapter. It covers server prices, checkout replay,
payment confirmation, scoped access, CSRF, revocation and partial/full refund
concurrency with a simulated lost provider response.

After `npm run check`, install the pinned browser with
`$env:PLAYWRIGHT_BROWSERS_PATH='.cache/playwright'; npx playwright install chromium`
and run `npm run test:browser`. Desktop and Pixel 7 Chromium scenarios cover both
pickup locations, hosted-payment return, private order status, admin loading,
HttpOnly cookies and logout. Screenshots and failure traces are ignored locally.
The test-only server binds 127.0.0.1:4179 and loads the actual web CSP. Test teardown
waits for its own database to stop, including on Windows.

The API process discards inherited integration settings, uses an empty dotenv
file, and rejects external HTTP/HTTPS. Browser requests outside loopback are
blocked; the hosted Stripe page is simulated. No email, SMS, push or live payment
credentials are configured. These checks do not verify provider sandboxes,
Supabase Storage, actual hosted PostgREST limits, physical printers or production.
