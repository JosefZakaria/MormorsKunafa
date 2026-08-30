-- Two bakery locations (Höja / Möllevången) and order/admin scoping columns.
-- Apply in the Supabase SQL editor (PostgreSQL).
-- Stable ids so app code can default in-store orders to Höja.

CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY,
  slug text NOT NULL,
  name text NOT NULL,
  address text NOT NULL DEFAULT '',
  fulfills_delivery boolean NOT NULL DEFAULT false,
  eat_here_enabled boolean NOT NULL DEFAULT true,
  takeaway_enabled boolean NOT NULL DEFAULT true,
  is_paused boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS locations_slug_uq ON locations (slug);

INSERT INTO locations (id, slug, name, address, fulfills_delivery, eat_here_enabled, takeaway_enabled, is_paused)
VALUES
  (
    '2f1a9c4e-6b7d-4e8f-a901-b2c3d4e5f601',
    'hoja',
    'Höja',
    'Karolingatan 1, 212 34 Malmö',
    true,
    true,
    true,
    false
  ),
  (
    '2f1a9c4e-6b7d-4e8f-a901-b2c3d4e5f602',
    'mollevangen',
    'Möllevången',
    'Bergsgatan 14, 211 34 Malmö',
    false,
    true,
    true,
    false
  )
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations (id);

CREATE INDEX IF NOT EXISTS orders_location_id_idx ON orders (location_id);

-- Existing eat-here / takeaway belonged to the original bakery (Höja). Delivery stays null.
UPDATE orders
SET location_id = '2f1a9c4e-6b7d-4e8f-a901-b2c3d4e5f601'
WHERE location_id IS NULL
  AND order_type IN ('eat-here', 'takeaway');

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'owner',
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations (id);

UPDATE admin_users
SET role = 'owner'
WHERE role IS NULL OR role NOT IN ('owner', 'location');

DO $$
BEGIN
  ALTER TABLE admin_users
    ADD CONSTRAINT admin_users_role_ck CHECK (role IN ('owner', 'location'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
