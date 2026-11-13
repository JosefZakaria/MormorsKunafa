-- Run only after the admin_sessions migration in an isolated PostgreSQL database.
-- Synthetic records only; all writes are rolled back.
BEGIN;
DO $test$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.admin_sessions'::regclass) THEN
    RAISE EXCEPTION 'Sessions must have RLS';
  END IF;
  IF has_table_privilege('anon', 'public.admin_sessions', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
    OR has_table_privilege('authenticated', 'public.admin_sessions', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') THEN
    RAISE EXCEPTION 'Client roles must not access sessions';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.admin_sessions', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.admin_sessions', 'INSERT')
    OR NOT has_table_privilege('service_role', 'public.admin_sessions', 'DELETE') THEN
    RAISE EXCEPTION 'Backend must be able to manage sessions';
  END IF;
END;
$test$;
ROLLBACK;
