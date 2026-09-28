-- Structured food information. No product is published as verified by this
-- migration; recipes and supplier labels must be reviewed manually first.

BEGIN;

CREATE OR REPLACE FUNCTION public.valid_food_ingredients(value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  ingredient jsonb;
  allergen text;
  allowed_allergens constant text[] := ARRAY[
    'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soybeans', 'milk',
    'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'
  ];
BEGIN
  IF jsonb_typeof(value) <> 'array' OR jsonb_array_length(value) NOT BETWEEN 1 AND 100 THEN
    RETURN false;
  END IF;
  FOR ingredient IN SELECT * FROM jsonb_array_elements(value)
  LOOP
    IF jsonb_typeof(ingredient) <> 'object'
      OR NOT ingredient ? 'name'
      OR length(btrim(ingredient->>'name')) NOT BETWEEN 1 AND 200
      OR (ingredient - ARRAY['name', 'allergens']) <> '{}'::jsonb
      OR (
        ingredient ? 'allergens'
        AND jsonb_typeof(ingredient->'allergens') <> 'array'
      )
    THEN
      RETURN false;
    END IF;
    FOR allergen IN SELECT jsonb_array_elements_text(COALESCE(ingredient->'allergens', '[]'::jsonb))
    LOOP
      IF NOT allergen = ANY(allowed_allergens) THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.valid_food_allergens(value text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT value IS NOT NULL
    AND cardinality(value) <= 14
    AND value <@ ARRAY[
      'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soybeans', 'milk',
      'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'
    ]::text[];
$$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ingredients_json jsonb,
  ADD COLUMN IF NOT EXISTS allergens text[],
  ADD COLUMN IF NOT EXISTS may_contain_allergens text[],
  ADD COLUMN IF NOT EXISTS is_prepacked boolean,
  ADD COLUMN IF NOT EXISTS food_information_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS food_information_verified_by text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_food_information_ck'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products ADD CONSTRAINT products_food_information_ck CHECK (
      food_information_verified_at IS NULL
      OR (
        public.valid_food_ingredients(ingredients_json)
        AND public.valid_food_allergens(allergens)
        AND public.valid_food_allergens(may_contain_allergens)
        AND is_prepacked IS NOT NULL
        AND length(btrim(food_information_verified_by)) BETWEEN 1 AND 128
      )
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.valid_food_ingredients(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.valid_food_allergens(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.valid_food_ingredients(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.valid_food_allergens(text[]) TO service_role;

COMMIT;
