-- Complement the immutable RLS migration. A schema-scoped REVOKE cannot
-- override PostgreSQL's global implicit PUBLIC EXECUTE grant for new functions.
-- The two existing application trigger helpers receive explicit private ACLs
-- so a restore does not depend on the target's implicit function defaults.
-- No application row or managed auth/storage object is changed.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF (SELECT relowner FROM pg_class WHERE oid='public.orders'::regclass)
    <> current_user::regrole THEN
    RAISE EXCEPTION 'Run private function defaults as the verified application object owner';
  END IF;
END;
$$;

ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.reject_security_audit_mutation(),
  public.protect_order_financial_history() FROM PUBLIC, anon, authenticated;

COMMIT;
