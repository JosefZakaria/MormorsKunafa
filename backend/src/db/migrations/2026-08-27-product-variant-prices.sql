-- Editable per-option prices (weight / persons / bread unit).
-- Apply in the Supabase SQL editor (PostgreSQL).
-- Existing products are seeded with today's menu prices; admin edits overwrite them.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS variant_prices jsonb;

-- Pistage Baklawa
UPDATE products
SET variant_prices = '{"250 gram":8900,"500 gram":17900,"1 kg":34900}'::jsonb
WHERE id = '1ae3fd7a-0042-4220-b330-b27b3147a0a6'
  AND variant_prices IS NULL;

-- Walnut Baklawa
UPDATE products
SET variant_prices = '{"250 gram":6900,"500 gram":12900,"1 kg":24900}'::jsonb
WHERE id = '054b4adf-4da3-42c0-aa9b-b939023aafad'
  AND variant_prices IS NULL;

-- Finmald Kunafa
UPDATE products
SET variant_prices = '{"2 personer":14900,"4 personer":24900}'::jsonb
WHERE id = '77048580-fd68-454d-b34b-395b351a96d4'
  AND variant_prices IS NULL;

-- Ashta Baklawa
UPDATE products
SET variant_prices = '{"500 gram":14900,"1 kg":24900}'::jsonb
WHERE id = 'fc469599-82e8-4ea3-aa18-0436bc2a2afd'
  AND variant_prices IS NULL;

-- Ostkaka (Halawet El Jibn)
UPDATE products
SET variant_prices = '{"250 gram":7900,"500 gram":14900,"1 kg":24900}'::jsonb
WHERE id = '6c1efa0e-149c-4259-9bd0-f85fd35f4b62'
  AND variant_prices IS NULL;

-- Krispig Kunafa
UPDATE products
SET variant_prices = '{"2 personer":14900,"4 personer":24900}'::jsonb
WHERE id = '37b8b656-2604-4ca6-9745-e0d6f52338c1'
  AND variant_prices IS NULL;

-- Bröd (kaek) — unit price per piece
UPDATE products
SET variant_prices = '{"st":1500}'::jsonb
WHERE id = '856b591e-08b3-40ec-b505-cb3b143293bb'
  AND variant_prices IS NULL;

-- Mad bel Ashta
UPDATE products
SET variant_prices = '{"250 gram":7900,"500 gram":14900,"1 kg":24900}'::jsonb
WHERE id = '94fd4a72-2685-4bc4-8813-0f5e5eaa4a1c'
  AND variant_prices IS NULL;

-- Mamoul Pistage
UPDATE products
SET variant_prices = '{"500 gram":17900,"1 kg":34900}'::jsonb
WHERE id = '6312f48a-b156-431b-9f6d-103cc30bc9f8'
  AND variant_prices IS NULL;
