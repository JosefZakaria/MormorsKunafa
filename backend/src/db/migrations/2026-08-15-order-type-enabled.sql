-- Per-order-type availability flags (Äta här / Ta med / Hemleverans).
-- Default true so existing behaviour is unchanged until an admin toggles them off.
-- Apply in the Supabase SQL editor (PostgreSQL).

ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS eat_here_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS takeaway_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_enabled boolean NOT NULL DEFAULT true;
