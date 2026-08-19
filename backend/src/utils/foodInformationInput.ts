import type { FoodAllergen, ProductIngredient } from '../shared/types/index.js';

export const FOOD_ALLERGEN_VALUES: readonly FoodAllergen[] = [
  'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soybeans', 'milk',
  'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs',
];

const FOOD_ALLERGEN_SET = new Set<FoodAllergen>(FOOD_ALLERGEN_VALUES);
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f]/u;

export type VerifiedFoodInformationInput = {
  ingredients: ProductIngredient[];
  allergens: FoodAllergen[];
  mayContainAllergens: FoodAllergen[];
  isPrepacked: boolean;
};

function parseAllergenList(value: unknown): FoodAllergen[] | null {
  if (!Array.isArray(value) || value.length > FOOD_ALLERGEN_VALUES.length) return null;
  const parsed: FoodAllergen[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !FOOD_ALLERGEN_SET.has(item as FoodAllergen)) return null;
    const allergen = item as FoodAllergen;
    if (parsed.includes(allergen)) return null;
    parsed.push(allergen);
  }
  return parsed;
}

export function parseVerifiedFoodInformationInput(
  value: unknown
): VerifiedFoodInformationInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const allowedKeys = [
    'ingredients', 'allergens', 'mayContainAllergens', 'isPrepacked', 'verificationConfirmed',
  ];
  if (Object.keys(record).some((key) => !allowedKeys.includes(key))) return null;
  if (record.verificationConfirmed !== true || typeof record.isPrepacked !== 'boolean') return null;
  if (!Array.isArray(record.ingredients) || record.ingredients.length < 1 || record.ingredients.length > 100) {
    return null;
  }

  const ingredients: ProductIngredient[] = [];
  const ingredientAllergens = new Set<FoodAllergen>();
  for (const item of record.ingredients) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const ingredient = item as Record<string, unknown>;
    if (Object.keys(ingredient).some((key) => !['name', 'allergens'].includes(key))) return null;
    const rawName = typeof ingredient.name === 'string' ? ingredient.name : '';
    const name = rawName.trim();
    if (!name || name.length > 200 || UNSAFE_TEXT.test(rawName)) return null;
    const allergens = ingredient.allergens === undefined
      ? []
      : parseAllergenList(ingredient.allergens);
    if (!allergens) return null;
    allergens.forEach((allergen) => ingredientAllergens.add(allergen));
    ingredients.push({ name, ...(allergens.length ? { allergens } : {}) });
  }

  const allergens = parseAllergenList(record.allergens);
  const mayContainAllergens = parseAllergenList(record.mayContainAllergens);
  if (!allergens || !mayContainAllergens) return null;
  if (
    allergens.length !== ingredientAllergens.size
    || allergens.some((allergen) => !ingredientAllergens.has(allergen))
    || mayContainAllergens.some((allergen) => ingredientAllergens.has(allergen))
  ) {
    return null;
  }

  return { ingredients, allergens, mayContainAllergens, isPrepacked: record.isPrepacked };
}
