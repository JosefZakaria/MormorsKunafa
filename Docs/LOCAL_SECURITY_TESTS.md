# Local security verification

The final branch run used Node 24.18.1 and npm 11.6.2, matching `.nvmrc` and
`packageManager`. Use those versions, then `npm ci --ignore-scripts`. If an npm
cache fails integrity validation, retry with a new isolated cache; never disable
integrity checks. Cached tools and synthetic artifacts must remain ignored.

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
concurrency with a simulated lost provider response. It also proves that older
delete endpoints return 409 without removing accounting history, failed realtime
or push dispatch cannot hide a paid order from the correctly scoped staff queue,
and verified payments store the receipt VAT snapshot atomically.

It also runs the catalogue/statistics suite (including 1007 paid orders and
2014 lines), upload-denial checks and a separate Swish transport simulation.
Swish tests cover compact and legacy references, canonical identity, accepted
response loss, partial/full refunds and reconciliation without repeated PUTs.
The fake HTTPS transport asserts the configured host, ID format and TLS
verification option; it does not validate real certificates or a merchant account.

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
The Upstash unit contract verifies hashed raw idempotency keys, the complete
readable response value and the declared 600-second lock/86,400-second result
TTLs; hosted access, backups, multi-instance behavior and observed expiry remain
external checks.

Run build/check first, then integration tests. Do not run another backend build
while API or browser tests are active: the build deliberately cleans `dist`.
`npm run test:api` builds first and runs the three API scripts sequentially. When
reusing an already verified build, those scripts can instead be run directly;
the final verification did this while the browser and database suites used their
own isolated clusters. Browser coverage is 22 Chromium cases across desktop and
Pixel 7; it is not a complete Safari/mobile-app/accessibility test matrix.

CI has a separate Windows integration job. It sets up the pinned PostgreSQL
runtime and runs `test:db`, `test:api` and the PowerShell connection-isolation
contract after the portable build/unit job. This mirrors the required sequencing;
CI still uses synthetic local resources and cannot replace the separate hosted
verification checklist in `EXTERNAL_RELEASE_VERIFICATION.md`.

Statistics/export pagination rejects bounds or later-page errors rather than
returning partial success. It is not a transaction-consistent backup or ledger
snapshot when records change during multiple page reads. The four maintenance
scripts are typechecked by `backend/tsconfig.maintenance.json` in the normal check.

The Windows operator-script contract is tested with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Test-PostgresConnectionIsolation.ps1
```

That test replaces every `psql`, `pg_dump` and `pg_restore` command with a test
script block. It tests hostile inherited settings, exact database identity,
`WhatIf`, failures and environment restoration without contacting a database.
`npm run test:db` separately runs the real integrity SQL against synthetic valid
and invalid records. Neither test is evidence that a production backup was taken
or that a real provider database can be restored successfully.
