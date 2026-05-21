"use strict";
/**
 * Resolves product image URLs for the Vercel-hosted frontend.
 * Supabase stores legacy WordPress paths (/wp-content/uploads/...) which no longer
 * serve on mormorskunafa.se (SPA). Map each product to a static file under /images/.
 *
 * To use original WordPress photos: copy files from Namecheap
 * public_html/wp-content/uploads/... into apps/web/public/wp-content/uploads/...
 * (same folder structure). Then set USE_WP_MIRROR = true below.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveProductImage = resolveProductImage;
/** WordPress media filename → static asset (from products_full.json image_url) */
const WP_BASENAME_TO_LOCAL = {
    '3.png': '/images/ashta-baklawa.jpg',
    '91.png': '/images/pistage-baklawa.jpg',
    'B-A-K-L-A-W-A-2.png': '/images/walnut-baklawa.jpg',
    '6.png': '/images/finmald-kunafa.jpg',
    '5.png': '/images/krispig-kunafa.jpg',
    '4.png': '/images/ostkaka.jpg',
    'Mamoul-3.png': '/images/harise-ashta.jpg',
    'Malmlo_Kaak-brod-4-scaled-500x667-1.jpg': '/images/kaake-kunafa.jpg',
    'yujjyjj.jpg': '/images/mormorsbox-mix.jpg',
    'ChatGPT-Image-27-jan.-2026-23_22_03.png': '/images/mamoul-pistage.jpg',
    'IMG_2011.jpg': '/images/pistagemix.jpg',
};
/** Product id → menu image (must match translation index / menu slots) */
const PRODUCT_IMAGE_BY_ID = {
    '1ae3fd7a-0042-4220-b330-b27b3147a0a6': '/images/pistage-baklawa.jpg',
    '054b4adf-4da3-42c0-aa9b-b939023aafad': '/images/walnut-baklawa.jpg',
    '77048580-fd68-454d-b34b-395b351a96d4': '/images/finmald-kunafa.jpg',
    'fc469599-82e8-4ea3-aa18-0436bc2a2afd': '/images/ashta-baklawa.jpg',
    '6c1efa0e-149c-4259-9bd0-f85fd35f4b62': '/images/ostkaka.jpg',
    '37b8b656-2604-4ca6-9745-e0d6f52338c1': '/images/krispig-kunafa.jpg',
    '856b591e-08b3-40ec-b505-cb3b143293bb': '/images/kaake-kunafa.jpg',
    '94fd4a72-2685-4bc4-8813-0f5e5eaa4a1c': '/images/harise-ashta.jpg',
    '6312f48a-b156-431b-9f6d-103cc30bc9f8': '/images/mamoul-pistage.jpg',
    'c005c8af-3f2e-401c-923f-7dac0f682cda': '/images/mormorsbox-mix.jpg',
    '9e6d210b-8637-4deb-889c-0726060288aa': '/images/pistagemix.jpg',
};
const PRODUCT_IMAGE_BY_SLUG = {
    'baklawa-pistage': '/images/pistage-baklawa.jpg',
    'baklawa-valnot': '/images/walnut-baklawa.jpg',
    'baklawa-ashta': '/images/ashta-baklawa.jpg',
    'finmald-kunafa': '/images/finmald-kunafa.jpg',
    'ostkaka': '/images/ostkaka.jpg',
    'krispig-kunafa': '/images/krispig-kunafa.jpg',
    '1-brod-kaek': '/images/kaake-kunafa.jpg',
    'mamoul-pistage-179-kr': '/images/mamoul-pistage.jpg',
    'mormorsbox-mix': '/images/mormorsbox-mix.jpg',
    'pistagemix': '/images/pistagemix.jpg',
};
/** Neutral placeholder — never reuse pistage for unknown products */
const FALLBACK_PRODUCT_IMAGE = '/images/walnut-baklawa-plated.jpg';
const USE_WP_MIRROR = false;
function isLegacyWordPressMediaUrl(url) {
    return /wp-content\/uploads/i.test(url);
}
function basenameFromUrl(url) {
    try {
        const path = url.includes('://') ? new URL(url).pathname : url;
        const base = path.split('/').pop();
        return base ? decodeURIComponent(base.split('?')[0]) : null;
    }
    catch {
        const base = url.split('/').pop();
        return base ? decodeURIComponent(base.split('?')[0]) : null;
    }
}
function wpRelativePath(url) {
    const m = url.match(/\/wp-content\/uploads\/(.+)/i);
    if (!m)
        return null;
    return `/wp-content/uploads/${m[1].split('?')[0]}`;
}
function localFromDbImageUrl(imageUrlFromDb) {
    const raw = imageUrlFromDb.trim();
    if (!raw)
        return null;
    const base = basenameFromUrl(raw);
    if (base && WP_BASENAME_TO_LOCAL[base]) {
        return WP_BASENAME_TO_LOCAL[base];
    }
    if (USE_WP_MIRROR && isLegacyWordPressMediaUrl(raw)) {
        const rel = wpRelativePath(raw);
        if (rel)
            return rel;
    }
    if (!isLegacyWordPressMediaUrl(raw)) {
        if (raw.startsWith('/'))
            return raw;
        if (raw.startsWith('http://') || raw.startsWith('https://'))
            return raw;
    }
    return null;
}
function resolveProductImage(productId, imageUrlFromDb, slug) {
    const raw = String(imageUrlFromDb ?? '').trim();
    const fromDb = raw ? localFromDbImageUrl(raw) : null;
    if (fromDb)
        return fromDb;
    const id = String(productId ?? '').trim();
    if (id && PRODUCT_IMAGE_BY_ID[id]) {
        return PRODUCT_IMAGE_BY_ID[id];
    }
    const slugKey = String(slug ?? '').trim().toLowerCase();
    if (slugKey && PRODUCT_IMAGE_BY_SLUG[slugKey]) {
        return PRODUCT_IMAGE_BY_SLUG[slugKey];
    }
    if (slugKey) {
        for (const [key, path] of Object.entries(PRODUCT_IMAGE_BY_SLUG)) {
            if (slugKey.startsWith(key) || key.startsWith(slugKey))
                return path;
        }
    }
    return FALLBACK_PRODUCT_IMAGE;
}
