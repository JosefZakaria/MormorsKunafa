-- Apply before deploying the opening-hours editor.
-- Per-location schedule. Missing values use the owner-confirmed baseline in the backend.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS opening_hours jsonb;

-- Access continues through the backend. Preserve backend-only access to locations.
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.locations FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
