# Backend database access verification

Applied to Supabase project `zwxdvyxrvixlsetylhur` on 2026-09-14.
Recorded remote migration: `20260914140557_restrict_public_tables_to_backend`.
The migration file is an exact copy of the applied SQL, using the remote version.

## Access model

The web/mobile clients call Express. Express uses `service_role` and its own
admin authentication. All nine application tables in `public` therefore have
RLS enabled with no client policies. This intentionally denies direct access.
All table and sequence privileges were revoked from `PUBLIC`, `anon`, and
`authenticated`. Existing `service_role` privileges were preserved.

Default table and sequence grants for new objects created by `postgres` in
`public` were also removed for these client roles. Defaults for Supabase-managed
roles were not changed. Future migrations must enable RLS and review grants;
this migration does not automatically enable RLS on future tables.

No changes were made to Supabase Storage or the backend application.
The backend still bypasses RLS and must enforce its own authorization.

## Verified

- All nine tables: RLS enabled; no client CRUD privileges; backend CRUD retained.
- `backend-access.sql`: 72 actual permission-denied checks (nine tables,
  two client roles, four operations), nine backend reads, and a backend
  order/item insert-read-update-delete cycle. The transaction was rolled back.
- Direct REST requests with an active publishable key: all nine tables returned
  HTTP 401 and PostgreSQL permission error `42501`. Requests used `limit=0`;
  no customer or admin records were downloaded.
- Production API before and after: health 200; products 200 (11 products);
  locations 200 (2 locations); order settings 200.
- Production admin pending orders and admin settings: 401 without authentication.
- Supabase security advisor: the five disabled-RLS errors were eliminated.
  The nine remaining `rls_enabled_no_policy` informational notices are expected
  for this backend-only access model:
  https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Scope of verification

The transaction test exercises database operations under the backend role.
It does not exercise the full customer checkout, a real payment, or an
interactive administrator login. No real order, payment, or notification was
created as part of verification.

To repeat the database checks, run `backend-access.sql` using a database
administrator connection capable of `SET ROLE`. Successful tests return a
PASS summary; unexpected access raises an exception.
