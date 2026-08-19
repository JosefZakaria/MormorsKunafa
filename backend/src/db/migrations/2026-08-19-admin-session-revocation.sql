-- Database-backed admin-session revocation.
-- Apply manually before deploying code that expects these columns.

BEGIN;

ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS token_version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'admin_users_token_version_ck'
      AND conrelid = 'public.admin_users'::regclass
  ) THEN
    ALTER TABLE public.admin_users
      ADD CONSTRAINT admin_users_token_version_ck CHECK (token_version >= 1);
  END IF;
END;
$$;

COMMIT;
