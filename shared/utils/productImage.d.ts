/**
 * Resolves product image URLs for the Vercel-hosted frontend.
 * Supabase stores legacy WordPress paths (/wp-content/uploads/...) which no longer
 * serve on mormorskunafa.se (SPA). Map each product to a static file under /images/.
 *
 * To use original WordPress photos: copy files from Namecheap
 * public_html/wp-content/uploads/... into apps/web/public/wp-content/uploads/...
 * (same folder structure). Then set USE_WP_MIRROR = true below.
 */
export declare function resolveProductImage(productId: string, imageUrlFromDb?: string | null, slug?: string | null): string;
//# sourceMappingURL=productImage.d.ts.map