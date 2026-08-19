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
    ('order_refund_items'),
    ('duplicate_stripe_refunds')
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
    ('delete_reconciled_checkout_draft'),
    ('preview_operational_order_pii_retention'),
    ('anonymize_operational_order_pii')
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

-- This result must be empty. Anonymized orders must not retain operational
-- contact fields, free text or customer status credentials.
SELECT id AS incompletely_anonymized_order
FROM public.orders
WHERE operational_pii_anonymized_at IS NOT NULL
  AND (
    customer_name IS NOT NULL
    OR customer_email IS NOT NULL
    OR COALESCE(customer_phone, '') <> ''
    OR delivery_info_json IS NOT NULL
    OR internal_notes IS NOT NULL
    OR cancellation_reason IS NOT NULL
    OR order_status_token_hash IS NOT NULL
    OR order_status_token_expires_at IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.order_items
      WHERE order_items.order_id = orders.id
        AND order_items.modifications_json IS NOT NULL
    )
  );

-- NOT VALID constraints are intentional during deployment, but this must be
-- empty after the documented data preflight and VALIDATE CONSTRAINT steps.
SELECT tables.relname AS table_name, constraints.conname AS constraint_name
FROM pg_catalog.pg_constraint AS constraints
JOIN pg_catalog.pg_class AS tables ON tables.oid = constraints.conrelid
JOIN pg_catalog.pg_namespace AS schemas ON schemas.oid = tables.relnamespace
WHERE schemas.nspname = 'public'
  AND NOT constraints.convalidated
ORDER BY tables.relname, constraints.conname;
