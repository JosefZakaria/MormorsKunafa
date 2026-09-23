-- Delivery pricing foundation. Does not activate city pricing in checkout.
-- Uses the existing backend-only admin_settings table; no new client grants.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.admin_settings
  ADD COLUMN IF NOT EXISTS delivery_default_fee_ore integer NOT NULL DEFAULT 7900
    CONSTRAINT admin_settings_delivery_default_fee_nonnegative CHECK (delivery_default_fee_ore >= 0),
  ADD COLUMN IF NOT EXISTS delivery_city_fees jsonb NOT NULL DEFAULT '[
    {"city":"Malmö","feeOre":7900},
    {"city":"Lund","feeOre":11900},
    {"city":"Burlöv","feeOre":11900},
    {"city":"Arlöv","feeOre":11900},
    {"city":"Helsingborg","feeOre":14900}
  ]'::jsonb
    CONSTRAINT admin_settings_delivery_city_fees_array CHECK (jsonb_typeof(delivery_city_fees) = 'array');

-- Existing rows receive these defaults. Re-running does not overwrite edited prices.
-- The application validates city entries, duplicate names and amounts before saving.
NOTIFY pgrst, 'reload schema';
COMMIT;
