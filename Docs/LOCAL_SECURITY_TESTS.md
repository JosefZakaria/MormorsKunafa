# Local security verification

Use Node 24.18.1 and npm 11.6.2, matching `.nvmrc` and
`packageManager`, then ordinary `npm ci` as required by the candidate's CI. If an npm
cache fails integrity validation, retry with a new isolated cache; never disable
integrity checks. Cached tools and synthetic artifacts must remain ignored.

Run `npm run check` for the application builds, unit tests and mobile typecheck.
Use `EXPO_NO_DOTENV=1` and `CI=1` for mobile checks. Run `npm run doctor:mobile`,
`npm run export:mobile:android` and `npm run export:mobile:ios` for SDK validation
and bundles. Exports do not replace native build or physical-device verification.
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
then run `npm run build:browser-test` and `npm run test:browser`. The test build
generates an ephemeral public VAPID key; no production push key is needed. Desktop and Pixel 7 Chromium scenarios cover both
pickup locations, hosted-payment return, private order status, admin loading,
HttpOnly cookies and logout. Screenshots and failure traces are ignored locally.
The test-only server binds 127.0.0.1:4179 and loads the actual web CSP. Test teardown
waits for its own database to stop, including on Windows.

The API process discards inherited integration settings, uses an empty dotenv
file, and rejects external HTTP/HTTPS. Browser requests outside loopback are
blocked; the hosted Stripe page is simulated. No email, SMS, push or live payment
credentials are configured. These checks do not verify provider sandboxes,
Supabase Storage, actual hosted PostgREST limits, physical printers or production.
The Upstash unit contract verifies hashed raw idempotency keys, AES-256-GCM
sealing of the minimized replay, key/payload binding, tamper and cross-key
rejection, transitional legacy reads and the declared 600-second lock/86,400-
second result TTLs. Hosted access, backups, multi-instance behavior and observed
expiry remain external checks.

Run build/check first, then integration tests. Do not run another backend build
while API or browser tests are active: the build deliberately cleans `dist`.
`npm run test:api` builds first and runs the six API scripts sequentially. When
reusing an already verified build, those scripts can instead be run directly;
this is safe only when those processes use their own isolated clusters. The final
local matrix ran API build/tests before starting the browser suite. Browser coverage is 26 Chromium cases across desktop and
Pixel 7; it is not a complete Safari/mobile-app/accessibility test matrix.

CI has three independent jobs on the PR merge result (or pushed commit), each verifying Node 24.18.1,
npm 11.6.2 and a clean `npm ci`. Ubuntu build/unit runs the security verifiers,
mobile Doctor/exports and high/critical audit gate. Windows runs `test:db`,
`test:api`, the PowerShell connection-isolation contract and `test:backup-restore`.
A separate Ubuntu job installs signed PostgreSQL 17.11 and Chromium under the
configured `PLAYWRIGHT_BROWSERS_PATH`, builds once and runs all 26 browser cases.
These jobs use synthetic local resources; actual CI results and hosted verification
are recorded separately in `EXTERNAL_RELEASE_VERIFICATION.md` and the release journal.

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
and invalid records. It verifies both `legacy-core` and `secured-ledgers`
profiles, rejects a partial ledger set, and checks refund relations and immutable
VAT snapshots. Neither test is evidence that a production backup was taken or
that a real provider database can be restored successfully.

On Windows, `npm run test:backup-restore` additionally exercises the real operator
scripts, `pg_dump` and `pg_restore` between two independently created loopback
clusters. It asserts archive scope, profile, ACLs including column grant options,
security metadata equality and fixed synthetic order/item/gross/audit counts.
Distinct Storage sentinels prove that the public archive leaves target Storage
untouched. Successful runs remove both clusters and temporary archives; failed cleanup
may leave remnants. Owned-cluster removal retries transient Windows file locks
three times after the server has stopped and the ownership marker has matched;
persistent errors still fail. A partially removed old cluster without its marker
must not be manually treated as owned or deleted by this procedure.
This bounded local fixture is not the full hosted financial A/B matrix. The
operator manifest has no source financial fingerprint: operators must separately
compare source and target orders, items, paid gross, VAT, provider events, audit
and refund ledgers at the backup boundary. `restore=verified_against_source_profile`
alone is not evidence of that full financial equality.

`backend/src/db/verification/verify-security-metadata.sql` uses only system
catalogs in a read-only transaction. The older `verify-security-posture.sql`
reads application rows and may only run against synthetic databases in this task.
