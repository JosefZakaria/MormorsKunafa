-- Stock per bakery location. Apply in the Supabase SQL editor (PostgreSQL).
-- Existing global stock_status is copied to every location so a current pause stays paused.

CREATE TABLE IF NOT EXISTS product_location_stock (
  product_id text NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations (id) ON DELETE CASCADE,
  in_stock boolean NOT NULL DEFAULT true,
  PRIMARY KEY (product_id, location_id)
);

CREATE INDEX IF NOT EXISTS product_location_stock_location_idx
  ON product_location_stock (location_id);

INSERT INTO product_location_stock (product_id, location_id, in_stock)
SELECT
  p.id,
  l.id,
  (p.stock_status IS NULL OR p.stock_status = 'instock')
FROM products p
CROSS JOIN locations l
ON CONFLICT (product_id, location_id) DO NOTHING;
