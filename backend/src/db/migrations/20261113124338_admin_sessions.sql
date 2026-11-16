-- Apply before deploying the cookie-based admin login. Existing accounts are unchanged.
BEGIN;
CREATE TABLE public.admin_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  admin_id text NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX admin_sessions_expiry_idx ON public.admin_sessions (expires_at);
CREATE INDEX admin_sessions_admin_idx ON public.admin_sessions (admin_id);
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.admin_sessions TO service_role;
COMMIT;
