-- Read-only post-deployment checks for the Supabase SQL editor.
-- Every result set should be empty unless a comment below says otherwise.

WITH expected_tables(table_name) AS (
  VALUES
    ('admin_users'),
    ('admin_settings'),
    ('products'),
    ('orders'),
    ('order_items'),
    ('admin_push_subscriptions'),
    ('admin_push_delivery_logs'),
    ('payment_provider_events'),
    ('security_audit_log'),
    ('order_refunds'),
    ('order_refund_items')
)
SELECT expected_tables.table_name AS missing_or_unprotected_table
FROM expected_tables
LEFT JOIN pg_catalog.pg_class AS tables
  ON tables.relname = expected_tables.table_name
LEFT JOIN pg_catalog.pg_namespace AS schemas
  ON schemas.oid = tables.relnamespace
  AND schemas.nspname = 'public'
WHERE tables.oid IS NULL
   OR schemas.oid IS NULL
   OR NOT tables.relrowsecurity
   OR NOT tables.relforcerowsecurity;

SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

SELECT object_name AS sequence_name, grantee, privilege_type
FROM information_schema.role_usage_grants
WHERE object_schema = 'public'
  AND object_type = 'SEQUENCE'
  AND grantee IN ('anon', 'authenticated')
ORDER BY object_name, grantee, privilege_type;

-- Review every returned row. Only deliberately exposed RPCs should be callable
-- by anon/authenticated; current application RPCs are service-role-only.
SELECT routine_name, grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY routine_name, grantee;

-- Both reconciliation RPCs cross forced RLS and must therefore remain narrow
-- SECURITY DEFINER functions with a fixed search_path. This result must be empty.
WITH expected_functions(function_name) AS (
  VALUES
    ('list_initiated_checkout_drafts'),
    ('delete_reconciled_checkout_draft')
)
SELECT expected_functions.function_name AS missing_or_unsafe_reconciliation_function
FROM expected_functions
LEFT JOIN pg_catalog.pg_proc AS functions
  ON functions.proname = expected_functions.function_name
LEFT JOIN pg_catalog.pg_namespace AS schemas
  ON schemas.oid = functions.pronamespace
  AND schemas.nspname = 'public'
WHERE functions.oid IS NULL
   OR schemas.oid IS NULL
   OR NOT functions.prosecdef
   OR NOT ('search_path=public, pg_temp' = ANY(functions.proconfig));

-- NOT VALID constraints are intentional during deployment, but this must be
-- empty after the documented data preflight and VALIDATE CONSTRAINT steps.
SELECT tables.relname AS table_name, constraints.conname AS constraint_name
FROM pg_catalog.pg_constraint AS constraints
JOIN pg_catalog.pg_class AS tables ON tables.oid = constraints.conrelid
JOIN pg_catalog.pg_namespace AS schemas ON schemas.oid = tables.relnamespace
WHERE schemas.nspname = 'public'
  AND NOT constraints.convalidated
ORDER BY tables.relname, constraints.conname;
