-- Deny direct client access to application tables. The backend uses the
-- Supabase service role and exposes only explicitly validated HTTP routes/RPCs.
-- Apply in a controlled maintenance window after the preceding migrations.

BEGIN;

DO $$
DECLARE
  protected_table text;
BEGIN
  FOREACH protected_table IN ARRAY ARRAY[
    'admin_users',
    'admin_settings',
    'products',
    'orders',
    'order_items',
    'admin_push_subscriptions',
    'admin_push_delivery_logs',
    'payment_provider_events',
    'security_audit_log',
    'order_refunds',
    'order_refund_items',
    'duplicate_stripe_refunds'
  ]
  LOOP
    IF to_regclass(format('public.%I', protected_table)) IS NULL THEN
      RAISE EXCEPTION 'Required table public.% is missing', protected_table;
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      protected_table
    );
    EXECUTE format(
      'ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',
      protected_table
    );
    EXECUTE format(
      'REVOKE ALL ON TABLE public.%I FROM anon, authenticated',
      protected_table
    );
  END LOOP;
END
$$;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- Keep future tables, sequences and functions private unless a later reviewed
-- migration grants a narrow permission explicitly. These defaults apply to
-- objects created by the role that runs this migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;
