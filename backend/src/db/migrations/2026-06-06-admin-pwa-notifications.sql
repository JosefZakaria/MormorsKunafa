-- PWA push subscriptions for admin devices
CREATE TABLE IF NOT EXISTS admin_push_subscriptions (
  id uuid PRIMARY KEY,
  admin_id text NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  device_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_failure_reason text
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_push_subscriptions_admin_endpoint_uq
  ON admin_push_subscriptions(admin_id, endpoint);

CREATE INDEX IF NOT EXISTS admin_push_subscriptions_active_idx
  ON admin_push_subscriptions(disabled_at)
  WHERE disabled_at IS NULL;

-- Delivery log used for idempotency and troubleshooting
CREATE TABLE IF NOT EXISTS admin_push_delivery_logs (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  status text NOT NULL,
  status_code integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_push_delivery_logs_status_ck CHECK (status IN ('success', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_push_delivery_logs_event_sub_uq
  ON admin_push_delivery_logs(event_id, subscription_id);

CREATE INDEX IF NOT EXISTS admin_push_delivery_logs_event_idx
  ON admin_push_delivery_logs(event_id);
