import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '@shared/api';
import { parseDeliveryPricing, type DeliveryPricing } from '@shared/utils/deliveryPricing';
import { adminApi } from '../../../services/api';
import { Button } from '../../../components/common/Button/Button';
import './DeliveryPricingSettings.css';

type CityDraft = { id: number; city: string; price: string };
type Draft = { defaultPrice: string; cities: CityDraft[] };

function parseKronor(value: string): number {
    const text = value.trim().replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(text)) {
        throw new Error('Ange avgifter i kronor, minst 0 och med högst två decimaler.');
    }
    return Math.round(Number(text) * 100);
}

function errorMessage(error: unknown): string {
    if (error instanceof ApiError && error.data && typeof error.data === 'object' && 'error' in error.data) {
        return String(error.data.error);
    }
    return error instanceof Error ? error.message : 'Kunde inte hantera leveranspriser. Försök igen.';
}

export function DeliveryPricingSettings() {
    const prefix = useId();
    const nextId = useRef(0);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [loading, setLoading] = useState(true);
    const [reload, setReload] = useState(0);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    function toDraft(pricing: DeliveryPricing): Draft {
        return {
            defaultPrice: String(pricing.defaultFeeOre / 100).replace('.', ','),
            cities: pricing.cityFees.map(({ city, feeOre }) => ({
                id: nextId.current++, city, price: String(feeOre / 100).replace('.', ','),
            })),
        };
    }

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError('');
        adminApi.getDeliveryPricing()
            .then((pricing) => { if (!cancelled) setDraft(toDraft(parseDeliveryPricing(pricing))); })
            .catch((err: unknown) => { if (!cancelled) setError(errorMessage(err)); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [reload]);

    function edit(next: Draft) {
        setDraft(next);
        setDirty(true);
        setMessage('');
        setError('');
    }

    async function save(event: FormEvent) {
        event.preventDefault();
        if (!draft || saving) return;
        setError('');
        setMessage('');
        try {
            const pricing = parseDeliveryPricing({
                defaultFeeOre: parseKronor(draft.defaultPrice),
                cityFees: draft.cities.map(({ city, price }) => ({ city, feeOre: parseKronor(price) })),
            });
            setSaving(true);
            const saved = await adminApi.updateDeliveryPricing(pricing);
            setDraft(toDraft(parseDeliveryPricing(saved)));
            setDirty(false);
            setMessage('Leveranspriserna har sparats.');
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setSaving(false);
        }
    }

    return (
        <section className="rush-card delivery-pricing" aria-labelledby={`${prefix}-title`}>
            <h3 id={`${prefix}-title`}>Leveranspriser</h3>
            <p>Standardavgiften gäller för orter som saknar ett eget stadspris.</p>
            <p className="delivery-pricing__notice">Priserna kan förberedas här. Kassan använder fortfarande 79 kr tills det nya leveransflödet aktiveras.</p>
            {loading && <p role="status">Laddar leveranspriser…</p>}
            {error && <p role="alert" className="delivery-pricing__error">{error}</p>}
            {!loading && !draft && <Button type="button" variant="outline" onClick={() => setReload((n) => n + 1)}>Försök igen</Button>}
            {draft && (
                <form onSubmit={save} noValidate>
                    <fieldset disabled={saving}>
                        <label htmlFor={`${prefix}-default`}>Standardavgift för övriga Sverige (kr)</label>
                        <input id={`${prefix}-default`} inputMode="decimal" value={draft.defaultPrice}
                            onChange={(event) => edit({ ...draft, defaultPrice: event.target.value })} />
                        <h4>Städer med eget pris</h4>
                        <p className="delivery-pricing__hint">Ta bort en stad för att låta den följa standardavgiften.</p>
                        {draft.cities.length === 0 && <p>Alla orter följer standardavgiften.</p>}
                        {draft.cities.map((row, index) => (
                            <div className="delivery-pricing__row" key={row.id}>
                                <div>
                                    <label htmlFor={`${prefix}-city-${row.id}`}>Ort {index + 1}</label>
                                    <input id={`${prefix}-city-${row.id}`} value={row.city} autoComplete="off"
                                        onChange={(event) => edit({ ...draft, cities: draft.cities.map((item) => item.id === row.id ? { ...item, city: event.target.value } : item) })} />
                                </div>
                                <div>
                                    <label htmlFor={`${prefix}-price-${row.id}`}>Avgift (kr), ort {index + 1}</label>
                                    <input id={`${prefix}-price-${row.id}`} inputMode="decimal" value={row.price}
                                        onChange={(event) => edit({ ...draft, cities: draft.cities.map((item) => item.id === row.id ? { ...item, price: event.target.value } : item) })} />
                                </div>
                                <Button type="button" variant="ghost" aria-label={`Ta bort ${row.city || `ort ${index + 1}`}`}
                                    onClick={() => edit({ ...draft, cities: draft.cities.filter((item) => item.id !== row.id) })}>Ta bort</Button>
                            </div>
                        ))}
                        <div className="delivery-pricing__actions">
                            <Button type="button" variant="outline" onClick={() => edit({ ...draft, cities: [...draft.cities, { id: nextId.current++, city: '', price: '' }] })}>Lägg till stad</Button>
                            <Button type="submit" disabled={!dirty}>{saving ? 'Sparar…' : 'Spara leveranspriser'}</Button>
                        </div>
                    </fieldset>
                    <p role="status">{message || (dirty ? 'Du har osparade ändringar.' : '')}</p>
                </form>
            )}
        </section>
    );
}
