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
