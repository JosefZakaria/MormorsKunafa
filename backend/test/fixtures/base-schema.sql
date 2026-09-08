-- Synthetic pre-security PostgreSQL contract, reconstructed from application
-- queries and versioned migrations. This is not a production schema export.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[]
);

CREATE TABLE public.admin_users (
  id text PRIMARY KEY, email text UNIQUE NOT NULL, password_hash text NOT NULL,
  display_name text NOT NULL DEFAULT '', created_at timestamptz DEFAULT now(), last_login_at timestamptz
);
CREATE TABLE public.admin_settings (
  id integer PRIMARY KEY DEFAULT 1, default_preparation_time_minutes integer NOT NULL DEFAULT 30,
  is_paused boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.admin_settings(id) VALUES (1);
CREATE TABLE public.products (
  id text PRIMARY KEY, name text NOT NULL, slug text UNIQUE NOT NULL, description text,
  image_url text, price_ore integer NOT NULL DEFAULT 0, stock_quantity integer,
  stock_status text DEFAULT 'instock', sku text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.orders (
  id uuid PRIMARY KEY, order_number text UNIQUE NOT NULL, status text NOT NULL DEFAULT 'ny',
  order_type text NOT NULL DEFAULT 'takeaway', payment_method text NOT NULL DEFAULT 'card',
  payment_status text NOT NULL DEFAULT 'pending', stripe_checkout_session_id text,
  swish_instruction_id text, swish_payment_reference text, total_ore bigint NOT NULL DEFAULT 100,
  default_preparation_time_minutes integer NOT NULL DEFAULT 30,
  estimated_ready_at timestamptz, scheduled_at timestamptz,
  customer_name text, customer_email text, customer_phone text NOT NULL,
  delivery_info_json jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz,
  completed_at timestamptz, cancellation_reason text, cancelled_at timestamptz,
  refund_status text DEFAULT 'none', internal_notes text
);
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id text, product_name_snapshot text NOT NULL, quantity integer NOT NULL DEFAULT 1,
  price_ore integer NOT NULL, modifications_json jsonb
);
