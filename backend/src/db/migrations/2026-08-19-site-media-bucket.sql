-- Public bucket for menu and hero images.
-- Apply in the Supabase SQL editor if the API cannot create the bucket itself.
-- Backend uploads use the service role key (bypasses Storage RLS).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-media',
  'site-media',
  true,
  4194304,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
