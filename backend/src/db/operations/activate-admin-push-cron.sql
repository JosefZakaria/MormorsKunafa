-- Run only after the new backend is live and both Vault entries exist:
--   push_worker_url    = https://<production-backend>/api/internal/push/drain
--   push_worker_secret = the same 32+-character value as PUSH_WORKER_SECRET in Vercel
-- Store both with vault.create_secret(...) in the Supabase SQL editor.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $check$
BEGIN
  IF (SELECT count(*) FROM vault.decrypted_secrets
      WHERE name IN ('push_worker_url', 'push_worker_secret')) <> 2 THEN
    RAISE EXCEPTION 'push_worker_url and push_worker_secret must exist in Supabase Vault';
  END IF;
END
$check$;

SELECT cron.schedule(
  'admin-push-outbox-every-minute',
  '* * * * *',
  $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_worker_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_worker_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $job$
);
