import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Location, Order, OrderItem, PhoneOrderRequest, Product } from '@shared/types';
import { resolveProductImage } from '@shared/utils/productImage.ts';
import { clampScheduledClock, findNextOrderableSlot, getOrderableClockRange, validateScheduledOrderTime } from '@shared/utils/openingHours';
import { dateToStockholmInputValue, PRE_ORDER_LEAD_MINUTES } from '@shared/utils/scheduledTime';
import { adminApi, productApi } from '../../../services/api';
import { Button } from '../../../components/common/Button/Button';
import { getBreadUnitPriceOre, getFixedWeight, getProductOptions, getVariantPriceOre, isBreadProduct, isMenuExcluded } from '../../../utils/productVariantPrices';
import './PhoneOrdersTab.css';

const money = (ore: number) => `${(ore / 100).toLocaleString('sv-SE', { maximumFractionDigits: 2 })} kr`;
const EMPTY_CUSTOMER = { firstName: '', lastName: '', phone: '', email: '' };

function PhoneProduct({ product, onAdd }: { product: Product; onAdd: (item: OrderItem) => void }) {
    const options = getProductOptions(product);
    const [option, setOption] = useState(options[0] ?? '');
    const image = resolveProductImage(product.id, product.image);
    const [failedImage, setFailedImage] = useState<string | null>(null);
    const price = isBreadProduct(product) ? getBreadUnitPriceOre(product) : getVariantPriceOre(product, option) ?? product.price;
    return (
        <article className="phone-product">
            <div className="phone-product__image-wrap">
                {failedImage === image ? <span>Bild saknas</span> : (
                    <img src={image} alt={product.name} loading="lazy" decoding="async" onError={() => setFailedImage(image)} />
                )}
            </div>
            <div className="phone-product__details">
                <h4>{product.name}</h4>
                {getFixedWeight(product) && <span className="phone-product__weight">{getFixedWeight(product)}</span>}
                {options.length > 0 && (
                    <select aria-label={`Storlek för ${product.name}`} value={option} onChange={event => setOption(event.target.value)}>
                        {options.map(label => <option key={label} value={label}>{label}</option>)}
                    </select>
                )}
                <span className="phone-product__price">{money(price)}{isBreadProduct(product) ? ' / st' : ''}</span>
            </div>
            <Button size="sm" aria-label={`Lägg till ${product.name}`} disabled={!product.inStock} onClick={() => onAdd({
                productId: `${product.id}${option ? `-${option}` : ''}`,
                productName: `${product.name}${option ? ` (${option})` : ''}`,
                price, quantity: 1,
            })}>Lägg till</Button>
        </article>
    );
}

export function PhoneOrdersTab({ active, locations, paused, preparationMinutes, onCreated }: {
    active: boolean; locations: Location[]; paused: boolean; preparationMinutes: number; onCreated: (order: Order) => void;
}) {
    const [locationId, setLocationId] = useState('');
    const [products, setProducts] = useState<Product[]>([]);
    const [items, setItems] = useState<OrderItem[]>([]);
    const [customer, setCustomer] = useState(EMPTY_CUSTOMER);
    const [notes, setNotes] = useState('');
    const [pickupMode, setPickupMode] = useState<'asap' | 'scheduled'>('asap');
    const [pickupSlot, setPickupSlot] = useState(() => findNextOrderableSlot(preparationMinutes));
    const [nowMs, setNowMs] = useState(Date.now);
    const [loading, setLoading] = useState(false);
    const [menuError, setMenuError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [reload, setReload] = useState(0);
    const [requestId, setRequestId] = useState(() => crypto.randomUUID());
    const submittingRef = useRef(false);
    const location = locations.find(place => place.id === locationId);
    const unavailable = paused || !location || location.isPaused || !location.takeawayEnabled;
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const clockRange = pickupMode === 'scheduled' && pickupSlot.dateStr
        ? getOrderableClockRange(pickupSlot.dateStr, preparationMinutes, new Date(nowMs))
        : null;

    useEffect(() => {
        if (!active || pickupMode !== 'scheduled') return;
        setNowMs(Date.now());
        const timer = setInterval(() => setNowMs(Date.now()), 15_000);
        return () => clearInterval(timer);
    }, [active, pickupMode]);

    useEffect(() => {
        if (!active || !locationId) return;
        let cancelled = false;
        setLoading(true);
        setMenuError(null);
        productApi.getAll(locationId).then(menu => {
            // A failed location-stock lookup must not silently show the global assortment.
            if (menu.some(product => typeof product.stockByLocation?.[locationId] !== 'boolean')) {
                throw new Error('Lokalens lageruppgifter saknas.');
            }
            if (!cancelled) setProducts(menu.filter(product => product.stockByLocation?.[locationId] === true && !product.hidden && !isMenuExcluded(product)));
        }).catch(() => {
            if (!cancelled) { setProducts([]); setMenuError('Kunde inte hämta lokalens meny. Försök igen.'); }
        }).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [active, locationId, reload]);

    const add = (item: OrderItem) => {
        setSuccess(null);
        setItems(current => {
            const existing = current.find(row => row.productId === item.productId);
            return existing
                ? current.map(row => row.productId === item.productId ? { ...row, quantity: Math.min(100, row.quantity + 1) } : row)
                : [...current, item];
        });
    };

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (submittingRef.current || unavailable || !items.length || loading || menuError) return;
        let scheduledTime: string | undefined;
        if (pickupMode === 'scheduled') {
            if (!pickupSlot.dateStr || !pickupSlot.clock) {
                setError('Välj datum och tid för hämtning.');
                return;
            }
            scheduledTime = `${pickupSlot.dateStr}T${pickupSlot.clock}:00`;
            const validation = validateScheduledOrderTime(scheduledTime, preparationMinutes);
            if (pickupSlot.dateStr < dateToStockholmInputValue() || !validation.valid) {
                setError(!validation.valid ? validation.error : 'Välj ett datum i framtiden för hämtning.');
                return;
            }
        }
        submittingRef.current = true;
        setSubmitting(true);
        setError(null);
        setSuccess(null);
        const payload: PhoneOrderRequest = {
            requestId, locationId, customer,
            items: items.map(({ productId, quantity }) => ({ productId, quantity })), notes,
            ...(scheduledTime ? { scheduledTime } : {}),
        };
        try {
            const order = await adminApi.createPhoneOrder(payload);
            const pickupLabel = order.scheduledTime
                ? ` Hämtning ${new Date(order.scheduledTime).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', dateStyle: 'short', timeStyle: 'short' })}.`
                : '';
            setSuccess(`Beställning ${order.orderNumber} skickad till ${location?.name}.${pickupLabel} ${money(order.totalPrice)} betalas vid hämtning.`);
            setItems([]);
            setCustomer(EMPTY_CUSTOMER);
            setNotes('');
            setPickupMode('asap');
            setPickupSlot(findNextOrderableSlot(preparationMinutes));
            setRequestId(crypto.randomUUID());
            onCreated(order);
        } catch (failure) {
            const detail = failure as { data?: { error?: string } };
            setError(detail.data?.error || 'Beställningen kunde inte bekräftas. Försök igen med samma beställning.');
        } finally {
            submittingRef.current = false;
            setSubmitting(false);
        }
    };

    return (
        <div className="phone-orders" hidden={!active}>
            <h2>Telefonbeställning</h2>
            <p>Skicka en beställning för upphämtning till den valda lokalen. Kunden betalar i lokalen.</p>
            {success && <p className="phone-orders__success" role="status">{success}</p>}
            <fieldset disabled={submitting} className="phone-orders__location">
                <label htmlFor="phone-location">Lokal för upphämtning</label>
                <select id="phone-location" value={locationId} onChange={event => {
                    setLocationId(event.target.value); setProducts([]); setItems([]); setError(null); setSuccess(null);
                    setRequestId(crypto.randomUUID());
                }}>
                    <option value="">Välj lokal</option>
                    {locations.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}
                </select>
            </fieldset>
            {location && unavailable && <p className="phone-orders__error" role="status">Beställningar för upphämtning är pausade på den valda lokalen.</p>}
            {location && (
                <div className="phone-orders__layout">
                    <fieldset disabled={submitting || unavailable} className="phone-orders__menu">
                        <h3>Meny · {location.name}</h3>
                        <p>Varor som finns i lager på {location.name}.</p>
                        {loading ? <p>Laddar meny…</p> : menuError ? (
                            <div role="alert"><p>{menuError}</p><Button size="sm" onClick={() => setReload(current => current + 1)}>Försök igen</Button></div>
                        ) : products.length ? (
                            <div className="phone-orders__products">
                                {products.map(product => <PhoneProduct key={`${locationId}-${product.id}`} product={product} onAdd={add} />)}
                            </div>
                        ) : <p>Inga tillgängliga produkter på den valda lokalen.</p>}
                    </fieldset>
                    <form onSubmit={submit} className="phone-orders__summary">
                        <fieldset disabled={submitting}>
                            <h3>Beställning · {location.name}</h3>
                            {!items.length && <p>Välj produkter från menyn.</p>}
                            {items.map(item => (
                                <div className="phone-orders__line" key={item.productId}>
                                    <strong>{item.productName}</strong>
                                    <div className="phone-orders__quantity">
                                        <button type="button" aria-label={`Minska antal ${item.productName}`} onClick={() => setItems(current => current.flatMap(row => row.productId !== item.productId ? [row] : row.quantity > 1 ? [{ ...row, quantity: row.quantity - 1 }] : []))}>−</button>
                                        <span>{item.quantity}</span>
                                        <button type="button" disabled={item.quantity >= 100} aria-label={`Öka antal ${item.productName}`} onClick={() => add(item)}>+</button>
                                        <span>{money(item.price * item.quantity)}</span>
                                        <button type="button" aria-label={`Ta bort ${item.productName}`} onClick={() => setItems(current => current.filter(row => row.productId !== item.productId))}>Ta bort</button>
                                    </div>
                                </div>
                            ))}
                            <p className="phone-orders__total">Totalt: {money(total)}</p>
                            <label htmlFor="phone-pickup-mode">När ska beställningen hämtas?</label>
                            <select id="phone-pickup-mode" value={pickupMode} onChange={event => {
                                const mode = event.target.value as 'asap' | 'scheduled';
                                setPickupMode(mode);
                                setError(null);
                                if (mode === 'scheduled') setPickupSlot(findNextOrderableSlot(preparationMinutes));
                            }}>
                                <option value="asap">Så snart som möjligt</option>
                                <option value="scheduled">Välj dag och tid</option>
                            </select>
                            {pickupMode === 'scheduled' && (
                                <div className="phone-orders__schedule">
                                    <div className="phone-orders__schedule-fields">
                                        <label>Datum för hämtning<input type="date" required min={dateToStockholmInputValue(new Date(nowMs))}
                                            value={pickupSlot.dateStr} onChange={event => {
                                                const dateStr = event.target.value;
                                                setPickupSlot(current => ({ dateStr, clock: dateStr ? clampScheduledClock(dateStr, current.clock, preparationMinutes) : current.clock }));
                                                setError(null);
                                            }} /></label>
                                        <label>Tid för hämtning<input type="time" required step={300}
                                            min={clockRange?.min} max={clockRange?.max} value={pickupSlot.clock}
                                            onChange={event => { setPickupSlot(current => ({ ...current, clock: event.target.value })); setError(null); }} /></label>
                                    </div>
                                    <p>Tiderna anges i svensk tid. Vid mer än {PRE_ORDER_LEAD_MINUTES} minuter till hämtning visas ordern i Förbeställningar, därefter i Inkommande.</p>
                                    {!clockRange && <p className="phone-orders__error" role="status">Inga hämtningstider finns kvar den valda dagen. Välj ett annat datum.</p>}
                                </div>
                            )}
                            <div className="phone-orders__customer">
                                <label>Förnamn<input autoComplete="given-name" maxLength={80} value={customer.firstName} onChange={event => setCustomer(current => ({ ...current, firstName: event.target.value }))} /></label>
                                <label>Efternamn<input autoComplete="family-name" maxLength={80} value={customer.lastName} onChange={event => setCustomer(current => ({ ...current, lastName: event.target.value }))} /></label>
                                <label>Telefonnummer<input type="tel" autoComplete="tel" maxLength={25} value={customer.phone} onChange={event => setCustomer(current => ({ ...current, phone: event.target.value }))} /></label>
                                <label>E-post<input type="email" autoComplete="email" maxLength={254} value={customer.email} onChange={event => setCustomer(current => ({ ...current, email: event.target.value }))} /></label>
                            </div>
                            <label>Notis till lokalen (valfritt)<textarea rows={3} maxLength={500} value={notes} onChange={event => setNotes(event.target.value)} /></label>
                            {error && <p className="phone-orders__error" role="alert">{error}</p>}
                            <Button type="submit" disabled={submitting || unavailable || !items.length || loading || Boolean(menuError)}>{submitting ? 'Skickar…' : `Skicka beställning till ${location.name}`}</Button>
                        </fieldset>
                    </form>
                </div>
            )}
        </div>
    );
}
