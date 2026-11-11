-- Optional data setup. Apply explicitly after review in the intended database.
-- Insert only: rerunning preserves any later admin edits to price, visibility and stock.
BEGIN;

WITH last_position AS (
  SELECT COALESCE(MAX(sort_order), 0) AS sort_order FROM public.products
), new_products AS (
  INSERT INTO public.products (
    id, name, slug, description, price_ore, variant_prices, hidden, stock_status, sort_order
  )
  SELECT item.id, item.name, item.slug, item.description, item.price_ore,
         item.variant_prices, TRUE, 'outofstock', last_position.sort_order + item.position
  FROM last_position
  CROSS JOIN (VALUES
    ('d1671a64-2ae3-407a-b9cc-e417678f26f0', 'Kunafa med ashta', 'kunafa-med-ashta',
     'Krispig kunafa med ashtafyllning. Liten för 3 personer och stor för 6 personer.',
     17900, '{"3 personer":17900,"6 personer":29900}'::jsonb, 1),
    ('bf8ec400-450b-4726-bc58-d2b6a53a28a6', 'Kunafabricka för 25 personer', 'kunafabricka-25-personer',
     'Malen eller krispig kunafa med ost för 25 personer. Hämtas på Höja. Beställ minst två timmar i förväg.',
     100000, '{"Malen med ost · 25 personer":100000,"Krispig med ost · 25 personer":100000}'::jsonb, 2)
  ) AS item(id, name, slug, description, price_ore, variant_prices, position)
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
INSERT INTO public.product_location_stock (product_id, location_id, in_stock)
SELECT new_products.id, locations.id, FALSE
FROM new_products CROSS JOIN public.locations AS locations;

COMMIT;
