import { useMemo, useState } from 'react';
import type { FoodAllergen, Product, ProductIngredient } from '@shared/types';
import { AccessibleDialog } from '../../../components/common/AccessibleDialog/AccessibleDialog';
import { Button } from '../../../components/common/Button/Button';
import { productApi } from '../../../services/api';

const ALLERGENS: Array<{ value: FoodAllergen; label: string }> = [
  { value: 'gluten', label: 'Gluten' },
  { value: 'crustaceans', label: 'Kräftdjur' },
  { value: 'eggs', label: 'Ägg' },
  { value: 'fish', label: 'Fisk' },
  { value: 'peanuts', label: 'Jordnötter' },
  { value: 'soybeans', label: 'Soja' },
  { value: 'milk', label: 'Mjölk' },
  { value: 'nuts', label: 'Nötter' },
  { value: 'celery', label: 'Selleri' },
  { value: 'mustard', label: 'Senap' },
  { value: 'sesame', label: 'Sesam' },
  { value: 'sulphites', label: 'Sulfiter' },
  { value: 'lupin', label: 'Lupin' },
  { value: 'molluscs', label: 'Blötdjur' },
];

type EditableIngredient = { name: string; allergens: FoodAllergen[] };

function editableIngredients(product: Product): EditableIngredient[] {
  if (!product.ingredients?.length) return [{ name: '', allergens: [] }];
  return product.ingredients.map((ingredient) => ({
    name: ingredient.name,
    allergens: [...(ingredient.allergens ?? [])],
  }));
}

export function FoodInformationModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: (product: Product) => void;
}) {
  const [ingredients, setIngredients] = useState<EditableIngredient[]>(() => editableIngredients(product));
  const [traces, setTraces] = useState<FoodAllergen[]>(product.mayContainAllergens ?? []);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const declaredAllergens = useMemo(
    () => [...new Set(ingredients.flatMap((ingredient) => ingredient.allergens))],
    [ingredients]
  );
  const canSave = ingredients.length > 0
    && ingredients.every((ingredient) => ingredient.name.trim().length > 0)
    && confirmed
    && !traces.some((allergen) => declaredAllergens.includes(allergen));

  const toggleIngredientAllergen = (index: number, allergen: FoodAllergen) => {
    setIngredients((current) => current.map((ingredient, ingredientIndex) => {
      if (ingredientIndex !== index) return ingredient;
      const allergens = ingredient.allergens.includes(allergen)
        ? ingredient.allergens.filter((item) => item !== allergen)
        : [...ingredient.allergens, allergen];
      return { ...ingredient, allergens };
    }));
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const normalizedIngredients: ProductIngredient[] = ingredients.map((ingredient) => ({
        name: ingredient.name.trim(),
        ...(ingredient.allergens.length ? { allergens: ingredient.allergens } : {}),
      }));
      const saved = await productApi.updateFoodInformation(product.id, {
        ingredients: normalizedIngredients,
        allergens: declaredAllergens,
        mayContainAllergens: traces,
        isPrepacked: false,
        verificationConfirmed: true,
      });
      onSaved(saved);
    } catch {
      setError('Kunde inte spara. Kontrollera att uppgifterna är kompletta och konsekventa.');
    } finally {
      setSaving(false);
    }
  };

  const revoke = async () => {
    setSaving(true);
    setError(null);
    try {
      onSaved(await productApi.revokeFoodInformation(product.id));
    } catch {
      setError('Kunde inte ta bort verifieringen.');
      setSaving(false);
    }
  };

  return (
    <AccessibleDialog
      labelledBy="food-information-title"
      onClose={onClose}
      closeDisabled={saving}
      dialogClassName="food-information-modal"
    >
      <h2 id="food-information-title">Ingredienser och allergener</h2>
      <p><strong>{product.name}</strong></p>
      <div className="food-information-warning" role="note">
        Produkten tillverkas efter beställning och registreras som inte färdigförpackad.
        Individuella önskemål får aldrig beskrivas som en garanti mot korskontamination.
      </div>

      <div className="food-information-ingredients">
        {ingredients.map((ingredient, index) => (
          <fieldset className="food-information-ingredient" key={index}>
            <legend>Ingrediens {index + 1}</legend>
            <label htmlFor={`food-ingredient-${index}`}>Ingrediensnamn</label>
            <input
              id={`food-ingredient-${index}`}
              className="stats-modal-input"
              value={ingredient.name}
              maxLength={200}
              onChange={(event) => setIngredients((current) => current.map((item, itemIndex) => (
                itemIndex === index ? { ...item, name: event.target.value } : item
              )))}
              autoFocus={index === 0}
            />
            <div className="food-information-checkboxes" aria-label={`Allergener i ingrediens ${index + 1}`}>
              {ALLERGENS.map((allergen) => (
                <label key={allergen.value}>
                  <input
                    type="checkbox"
                    checked={ingredient.allergens.includes(allergen.value)}
                    onChange={() => toggleIngredientAllergen(index, allergen.value)}
                  />
                  {allergen.label}
                </label>
              ))}
            </div>
            {ingredients.length > 1 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setIngredients((current) => current.filter((_, itemIndex) => itemIndex !== index))}
              >
                Ta bort ingrediens
              </Button>
            )}
          </fieldset>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => setIngredients((current) => [...current, { name: '', allergens: [] }])}
        disabled={ingredients.length >= 100}
      >
        Lägg till ingrediens
      </Button>

      <fieldset className="food-information-traces">
        <legend>Kan innehålla spår av</legend>
        <div className="food-information-checkboxes">
          {ALLERGENS.map((allergen) => (
            <label key={allergen.value}>
              <input
                type="checkbox"
                checked={traces.includes(allergen.value)}
                disabled={declaredAllergens.includes(allergen.value)}
                onChange={() => setTraces((current) => current.includes(allergen.value)
                  ? current.filter((item) => item !== allergen.value)
                  : [...current, allergen.value])}
              />
              {allergen.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="food-information-confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        Jag har kontrollerat uppgifterna mot aktuellt recept, leverantörsetiketter och kökets korskontaminationsrutin.
      </label>
      {error && <p className="stats-modal-error" role="alert">{error}</p>}
      <div className="stats-modal-actions food-information-actions">
        {product.foodInformationVerifiedAt && (
          <Button type="button" variant="ghost" onClick={revoke} disabled={saving}>
            Ta bort verifiering
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Avbryt</Button>
        <Button type="button" onClick={save} disabled={saving || !canSave}>
          {saving ? 'Sparar…' : 'Verifiera och publicera'}
        </Button>
      </div>
    </AccessibleDialog>
  );
}
