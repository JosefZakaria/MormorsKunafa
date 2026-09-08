-- Menu sort order + landing hero images (desktop / mobile).
-- Apply in the Supabase SQL editor (PostgreSQL).
-- Existing products keep alphabetical order until an admin rearranges them.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sort_order integer;

UPDATE products p
SET sort_order = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name ASC) AS rn
  FROM products
) sub
WHERE p.id = sub.id
  AND p.sort_order IS NULL;

UPDATE products
SET sort_order = 0
WHERE sort_order IS NULL;

ALTER TABLE products
  ALTER COLUMN sort_order SET DEFAULT 0,
  ALTER COLUMN sort_order SET NOT NULL;

ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS hero_image_desktop_url text,
  ADD COLUMN IF NOT EXISTS hero_image_mobile_url text;

UPDATE admin_settings
SET
  hero_image_desktop_url = COALESCE(NULLIF(hero_image_desktop_url, ''), '/images/kunafa-ashta.jpg'),
  hero_image_mobile_url = COALESCE(NULLIF(hero_image_mobile_url, ''), '/images/ny-kunafa-bild.jpg')
WHERE hero_image_desktop_url IS NULL
   OR hero_image_desktop_url = ''
   OR hero_image_mobile_url IS NULL
   OR hero_image_mobile_url = '';
