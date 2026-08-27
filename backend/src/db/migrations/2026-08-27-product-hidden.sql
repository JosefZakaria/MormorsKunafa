-- Hide products from the customer menu while keeping them in admin.
-- Apply in the Supabase SQL editor (PostgreSQL).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS hidden boolean;

UPDATE products
SET hidden = false
WHERE hidden IS NULL;

ALTER TABLE products
  ALTER COLUMN hidden SET DEFAULT false,
  ALTER COLUMN hidden SET NOT NULL;
