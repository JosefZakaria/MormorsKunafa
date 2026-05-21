import type { Product } from '@shared/types';

/** Map API product id (UUID) to translation index 1–14 so products match menu copy. */
const PRODUCT_ID_TO_TRANSLATION_INDEX: Record<string, string> = {
    '1ae3fd7a-0042-4220-b330-b27b3147a0a6': '1',   // Baklawa Pistage 89 kr
    '054b4adf-4da3-42c0-aa9b-b939023aafad': '2',   // Baklawa Valnöt 69 kr
    '77048580-fd68-454d-b34b-395b351a96d4': '3',   // Finmaldkunafa 149kr
    '37b8b656-2604-4ca6-9745-e0d6f52338c1': '8',   // Krispigkunafa 149kr
    '6c1efa0e-149c-4259-9bd0-f85fd35f4b62': '7',   // Halawet El Jibn (Ostkaka)
    'fc469599-82e8-4ea3-aa18-0436bc2a2afd': '5',   // Ashta Baklawa 149 kr
    '856b591e-08b3-40ec-b505-cb3b143293bb': '9',   // Bröd (kaek)
    '94fd4a72-2685-4bc4-8813-0f5e5eaa4a1c': '11',  // Mad bel Ashta
    'c005c8af-3f2e-401c-923f-7dac0f682cda': '12',  // Mormorsbox - BaklawaMix 299 kr
    '6312f48a-b156-431b-9f6d-103cc30bc9f8': '13',  // Mamoul Pistage 179 kr
    '9e6d210b-8637-4deb-889c-0726060288aa': '14',  // Pistagemix 499kr
};

/** Name patterns when id is not in map (e.g. different backend). */
const NAME_TO_INDEX: { pattern: RegExp; index: string }[] = [
    { pattern: /pistage\s*baklawa|baklawa\s*pistage/i, index: '1' },
    { pattern: /valnöt|walnut|valnot/i, index: '2' },
    { pattern: /finmald\s*kunafa|finmaldkunafa/i, index: '3' },
    { pattern: /ashta\s*kunafa|ashta\s*baklawa|kunafa\s*ashta|baklawa\s*ashta/i, index: '5' },
    { pattern: /halawet|ostkaka|el jibn/i, index: '7' },
    { pattern: /krispig\s*kunafa|krispigkunafa/i, index: '8' },
    { pattern: /bröd\s*\(\s*kaek|kaek\s*\)\s*15/i, index: '9' },
    { pattern: /mad\s*bel\s*ashta/i, index: '11' },
    { pattern: /mormorsbox\s*-\s*baklawa|baklawa\s*mix\s*299/i, index: '12' },
    { pattern: /mamoul\s*pistage|pistage\s*179/i, index: '13' },
    { pattern: /pistagemix\s*499|pistage\s*mix/i, index: '14' },
];

export function getTranslationIndex(product: Product): string | null {
    const byId = PRODUCT_ID_TO_TRANSLATION_INDEX[product.id];
    if (byId) return byId;
    const name = product.name || '';
    for (const { pattern, index } of NAME_TO_INDEX) {
        if (pattern.test(name)) return index;
    }
    return null;
}

/** Same display name logic as the public menu (per current language). */
export function getDisplayName(product: Product, t: (key: string) => string): string {
    const idx = getTranslationIndex(product);
    if (idx) {
        const translated = t(`products.${idx}.name`);
        if (translated !== `products.${idx}.name`) return translated;
    }
    const byKey = t(`products.${product.id}.name`);
    return byKey !== `products.${product.id}.name` ? byKey : product.name;
}
