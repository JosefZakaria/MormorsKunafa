/**
 * Resolves product image URLs for the Vercel-hosted frontend.
 * Supabase still stores legacy WordPress paths (/wp-content/uploads/...) which
 * no longer serve files — map to static assets in apps/web/public/images/.
 */

const PRODUCT_IMAGE_BY_ID: Record<string, string> = {
  '1ae3fd7a-0042-4220-b330-b27b3147a0a6': '/images/pistage-baklawa.jpg',
  '054b4adf-4da3-42c0-aa9b-b939023aafad': '/images/walnut-baklawa.jpg',
  '77048580-fd68-454d-b34b-395b351a96d4': '/images/finmald-kunafa.jpg',
  'fc469599-82e8-4ea3-aa18-0436bc2a2afd': '/images/ashta-baklawa.jpg',
  '6c1efa0e-149c-4259-9bd0-f85fd35f4b62': '/images/ostkaka.jpg',
  '37b8b656-2604-4ca6-9745-e0d6f52338c1': '/images/krispig-kunafa.jpg',
  '856b591e-08b3-40ec-b505-cb3b143293bb': '/images/kaake-kunafa.jpg',
  '94fd4a72-2685-4bc4-8813-0f5e5eaa4a1c': '/images/harise-ashta.jpg',
  '6312f48a-b156-431b-9f6d-103cc30bc9f8': '/images/pistage-baklawa.jpg',
  'c005c8af-3f2e-401c-923f-7dac0f682cda': '/images/pistage-baklawa.jpg',
  '9e6d210b-8637-4deb-889c-0726060288aa': '/images/pistage-baklawa.jpg',
  'f05b6a24-7b90-4dfb-8f2f-be67a475cbfa': '/images/pistage-baklawa.jpg',
};

const PRODUCT_IMAGE_BY_SLUG: Record<string, string> = {
  'baklawa-pistage': '/images/pistage-baklawa.jpg',
  'baklawa-valnot': '/images/walnut-baklawa.jpg',
  'baklawa-ashta': '/images/ashta-baklawa.jpg',
  'finmald-kunafa': '/images/finmald-kunafa.jpg',
  'ostkaka': '/images/ostkaka.jpg',
  'krispig-kunafa': '/images/krispig-kunafa.jpg',
  '1-brod-kaek': '/images/kaake-kunafa.jpg',
};

const DEFAULT_PRODUCT_IMAGE = '/images/pistage-baklawa.jpg';

function isLegacyWordPressMediaUrl(url: string): boolean {
  return /wp-content\/uploads/i.test(url);
}

export function resolveProductImage(
  productId: string,
  imageUrlFromDb?: string | null,
  slug?: string | null
): string {
  const id = String(productId ?? '').trim();
  if (id && PRODUCT_IMAGE_BY_ID[id]) {
    return PRODUCT_IMAGE_BY_ID[id];
  }

  const slugKey = String(slug ?? '').trim().toLowerCase();
  if (slugKey && PRODUCT_IMAGE_BY_SLUG[slugKey]) {
    return PRODUCT_IMAGE_BY_SLUG[slugKey];
  }

  const raw = String(imageUrlFromDb ?? '').trim();
  if (raw && !isLegacyWordPressMediaUrl(raw)) {
    if (raw.startsWith('/')) return raw;
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  }

  return DEFAULT_PRODUCT_IMAGE;
}
