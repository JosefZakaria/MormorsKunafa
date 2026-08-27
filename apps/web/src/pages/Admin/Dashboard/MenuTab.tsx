import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, GripVertical } from 'lucide-react';
import { ApiError } from '@shared/api';
import type { AdminSettings, Product } from '@shared/types';
import { Button } from '../../../components/common/Button/Button';
import { adminApi, productApi } from '../../../services/api';
import {
    formatPersonOption,
    getEditablePriceFields,
    inferPricingMode,
    MAX_VARIANT_OPTIONS,
    nextPersonCount,
    nextWeightLabel,
    parsePersonCount,
    WEIGHT_PRESETS,
    type PricingMode,
} from '../../../utils/productVariantPrices';
import { prepareDescriptionHtml, sanitizeDescriptionHtml } from '../../../utils/productDescriptionHtml';
import { DescriptionEditor } from './DescriptionEditor';

const DEFAULT_HERO_DESKTOP = '/images/kunafa-ashta.jpg';
const DEFAULT_HERO_MOBILE = '/images/ny-kunafa-bild.jpg';
const MAX_BYTES = 4 * 1024 * 1024;

function uploadErrorMessage(err: unknown): string {
    if (err instanceof ApiError && err.data && typeof err.data === 'object' && err.data !== null && 'error' in err.data) {
        const apiError = String((err.data as { error: string }).error);
        if (/too large/i.test(apiError)) return 'Bilden är för stor (max 4 MB).';
        if (/jpeg|png|webp|valid/i.test(apiError)) return 'Välj en JPG-, PNG- eller WebP-bild.';
    }
    return 'Kunde inte ladda upp bilden. Försök igen.';
}

function productErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof ApiError && err.data && typeof err.data === 'object' && err.data !== null && 'error' in err.data) {
        return String((err.data as { error: string }).error);
    }
    return fallback;
}

function parsePriceKrToOre(raw: string): number | null {
    const n = Number(raw.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
}

function formatPriceKr(ore: number): string {
    const kr = ore / 100;
    return Number.isInteger(kr) ? String(kr) : kr.toFixed(2);
}

function sortProducts(list: Product[]): Product[] {
    return [...list].sort((a, b) => {
        const order = (a.sortOrder || 0) - (b.sortOrder || 0);
        if (order !== 0) return order;
        return a.name.localeCompare(b.name, 'sv');
    });
}

function HeroSlot({
    title,
    hint,
    imageUrl,
    kind,
    variant,
    disabled,
    onUploaded,
    onError,
}: {
    title: string;
    hint: string;
    imageUrl: string;
    kind: 'hero-desktop' | 'hero-mobile';
    variant: 'desktop' | 'mobile';
    disabled: boolean;
    onUploaded: (settings: AdminSettings) => void;
    onError: (message: string) => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<string | null>(null);

    const handleFile = async (file: File | undefined) => {
        if (!file) return;
        if (file.size > MAX_BYTES) {
            onError('Bilden är för stor (max 4 MB).');
            return;
        }
        setBusy(true);
        setStatus(null);
        try {
            const result = await adminApi.uploadImage(kind, file);
            if (result.settings) onUploaded(result.settings);
            setStatus('Bilden är uppdaterad');
        } catch (err) {
            onError(uploadErrorMessage(err));
        } finally {
            setBusy(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <label className={`hero-upload-card hero-upload-card--${variant}${busy ? ' is-busy' : ''}`}>
            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                hidden
                disabled={disabled || busy}
                onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            <div className="hero-upload-card__preview">
                <img src={imageUrl} alt="" />
                {busy && <div className="hero-upload-card__overlay">Laddar upp…</div>}
            </div>
            <div className="hero-upload-card__meta">
                <strong>{title}</strong>
                <span>{hint}</span>
                {status && <em className="hero-upload-card__status">{status}</em>}
            </div>
        </label>
    );
}

const PRICING_MODES: { id: PricingMode; title: string; hint: string }[] = [
    { id: 'single', title: 'Fast pris', hint: 'Ett pris, ingen väljare' },
    { id: 'weight', title: 'Efter vikt', hint: 't.ex. 250 g, 500 g, 1 kg' },
    { id: 'persons', title: 'Antal personer', hint: 't.ex. kunafa 2 eller 4 pers.' },
    { id: 'bread', title: 'Per styck', hint: 'Kunden väljer antal med +/−' },
];

type OptionRow = { id: string; label: string; priceKr: string };

function newRowId(): string {
    return crypto.randomUUID();
}

function defaultWeightRows(): OptionRow[] {
    return WEIGHT_PRESETS.slice(0, 3).map((label) => ({ id: newRowId(), label, priceKr: '' }));
}

function defaultPersonRows(): OptionRow[] {
    return [2, 4].map((n) => ({ id: newRowId(), label: String(n), priceKr: '' }));
}

function rowsFromProduct(product: Product, mode: PricingMode): OptionRow[] {
    if (mode !== 'weight' && mode !== 'persons') return [];
    const fields = getEditablePriceFields(product).filter((field) => field.key !== 'st');
    if (!fields.length) return mode === 'weight' ? defaultWeightRows() : defaultPersonRows();
    return fields.map((field) => ({
        id: newRowId(),
        label: mode === 'persons' ? String(parsePersonCount(field.key) ?? 2) : field.key,
        priceKr: formatPriceKr(field.ore),
    }));
}

function ProductFormModal({
    product,
    onClose,
    onSaved,
    onError,
}: {
    product: Product | 'new';
    onClose: () => void;
    onSaved: (product: Product, mode: 'create' | 'update') => void;
    onError: (message: string) => void;
}) {
    const isNew = product === 'new';
    const initialMode: PricingMode = isNew ? 'single' : inferPricingMode(product);
    const [name, setName] = useState(isNew ? '' : product.name);
    const [pricingMode, setPricingMode] = useState<PricingMode>(initialMode);
    const [priceKr, setPriceKr] = useState(() => {
        if (isNew) return '';
        if (initialMode === 'bread') {
            const styck = getEditablePriceFields(product).find((field) => field.key === 'st');
            return formatPriceKr(styck?.ore ?? product.price);
        }
        if (initialMode === 'single') return formatPriceKr(product.price);
        return '';
    });
    const [optionRows, setOptionRows] = useState<OptionRow[]>(() =>
        isNew ? [] : rowsFromProduct(product, initialMode)
    );
    const [description, setDescription] = useState(
        isNew ? '' : prepareDescriptionHtml(product.description ?? '')
    );
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(isNew ? null : product.image);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const updateRow = (id: string, patch: Partial<OptionRow>) => {
        setOptionRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    };

    const applyPricingMode = (next: PricingMode) => {
        if (next === pricingMode) return;
        if ((next === 'single' || next === 'bread') && !priceKr.trim()) {
            const first = optionRows.map((row) => row.priceKr).find((value) => parsePriceKrToOre(value) != null);
            if (first) setPriceKr(first);
        }
        setPricingMode(next);
        setFormError(null);
        if (next === 'weight') setOptionRows(defaultWeightRows());
        else if (next === 'persons') setOptionRows(defaultPersonRows());
        else setOptionRows([]);
    };

    const addOptionRow = () => {
        if (optionRows.length >= MAX_VARIANT_OPTIONS) return;
        if (pricingMode === 'weight') {
            setOptionRows((prev) => [
                ...prev,
                { id: newRowId(), label: nextWeightLabel(prev.map((row) => row.label)), priceKr: '' },
            ]);
            return;
        }
        if (pricingMode === 'persons') {
            const counts = optionRows
                .map((row) => Number.parseInt(row.label, 10))
                .filter((n) => Number.isFinite(n) && n > 0);
            setOptionRows((prev) => [
                ...prev,
                { id: newRowId(), label: String(nextPersonCount(counts)), priceKr: '' },
            ]);
        }
    };

    const handleFile = (next: File | undefined) => {
        if (!next) return;
        if (next.size > MAX_BYTES) {
            setFormError('Bilden är för stor (max 4 MB).');
            return;
        }
        setFile(next);
        setPreview(URL.createObjectURL(next));
        setFormError(null);
    };

    const handleSave = async () => {
        const trimmed = name.trim();
        if (!trimmed) {
            setFormError('Ange ett namn.');
            return;
        }

        let priceOre: number;
        let variantPrices: Record<string, number> | null = null;

        if (pricingMode === 'single' || pricingMode === 'bread') {
            const parsed = parsePriceKrToOre(priceKr);
            if (parsed == null) {
                setFormError(pricingMode === 'bread' ? 'Ange ett giltigt pris per styck.' : 'Ange ett giltigt pris i kronor.');
                return;
            }
            priceOre = parsed;
            variantPrices = pricingMode === 'bread' ? { st: parsed } : null;
        } else {
            if (optionRows.length < 1) {
                setFormError('Lägg till minst ett alternativ.');
                return;
            }
            const next: Record<string, number> = {};
            const seen = new Set<string>();
            for (const row of optionRows) {
                let label: string;
                if (pricingMode === 'persons') {
                    const count = Number.parseInt(row.label, 10);
                    if (!Number.isFinite(count) || count < 1) {
                        setFormError('Ange hur många personer varje alternativ gäller.');
                        return;
                    }
                    label = formatPersonOption(count);
                } else {
                    label = row.label.trim();
                    if (!label) {
                        setFormError('Ange en vikt för varje rad.');
                        return;
                    }
                }
                const key = label.toLowerCase();
                if (seen.has(key)) {
                    setFormError(`Alternativet “${label}” är med mer än en gång.`);
                    return;
                }
                seen.add(key);
                const ore = parsePriceKrToOre(row.priceKr);
                if (ore == null) {
                    setFormError(`Ange ett giltigt pris för ${label}.`);
                    return;
                }
                next[label] = ore;
            }
            variantPrices = next;
            priceOre = Math.min(...Object.values(next));
        }

        setSaving(true);
        setFormError(null);
        try {
            if (isNew) {
                let image: string | undefined;
                if (file) {
                    const uploaded = await adminApi.uploadImage('product', file);
                    image = uploaded.url;
                }
                const created = await productApi.create({
                    name: trimmed,
                    price: priceOre,
                    description: sanitizeDescriptionHtml(description),
                    image,
                    ...(variantPrices ? { variantPrices } : {}),
                });
                onSaved(created, 'create');
            } else {
                const updated = await productApi.update(product.id, {
                    name: trimmed,
                    price: priceOre,
                    description: sanitizeDescriptionHtml(description),
                    variantPrices,
                });
                onSaved(updated, 'update');
            }
        } catch (err) {
            const message = productErrorMessage(err, 'Kunde inte spara varan. Försök igen.');
            setFormError(message);
            onError(message);
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previous;
        };
    }, []);

    const showOptionRows = pricingMode === 'weight' || pricingMode === 'persons';

    return createPortal(
        <div className="stats-modal-overlay" onClick={onClose}>
            <div className="stats-modal admin-product-modal" onClick={(e) => e.stopPropagation()}>
                <h2>{isNew ? 'Lägg till vara' : 'Ändra vara'}</h2>
                <label className="form-label" htmlFor="admin-product-name">Namn</label>
                <input
                    id="admin-product-name"
                    className="stats-modal-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={200}
                    autoFocus
                />

                <p className="form-label" id="admin-pricing-mode-label">Hur säljs varan?</p>
                <div className="admin-product-modal__modes" role="radiogroup" aria-labelledby="admin-pricing-mode-label">
                    {PRICING_MODES.map((mode) => (
                        <button
                            key={mode.id}
                            type="button"
                            role="radio"
                            aria-checked={pricingMode === mode.id}
                            className={`admin-product-modal__mode${pricingMode === mode.id ? ' is-active' : ''}`}
                            onClick={() => applyPricingMode(mode.id)}
                            disabled={saving}
                        >
                            <strong>{mode.title}</strong>
                            <span>{mode.hint}</span>
                        </button>
                    ))}
                </div>

                {pricingMode === 'single' && (
                    <>
                        <label className="form-label" htmlFor="admin-product-price">Pris (kr)</label>
                        <input
                            id="admin-product-price"
                            className="stats-modal-input"
                            inputMode="decimal"
                            value={priceKr}
                            onChange={(e) => setPriceKr(e.target.value)}
                            placeholder="149"
                        />
                    </>
                )}

                {pricingMode === 'bread' && (
                    <>
                        <label className="form-label" htmlFor="admin-product-price">Pris per styck (kr)</label>
                        <input
                            id="admin-product-price"
                            className="stats-modal-input"
                            inputMode="decimal"
                            value={priceKr}
                            onChange={(e) => setPriceKr(e.target.value)}
                            placeholder="15"
                        />
                    </>
                )}

                {showOptionRows && (
                    <>
                        <p className="form-label">
                            {pricingMode === 'persons' ? 'Antal personer och priser' : 'Vikter och priser'}
                        </p>
                        <p className="admin-product-modal__hint">
                            {pricingMode === 'persons'
                                ? 'Varje rad är ett val i menyn, t.ex. 2 personer eller 4 personer.'
                                : 'Lägg till de vikter kunden ska kunna välja. Varje vikt har ett eget pris.'}
                        </p>
                        <div className="admin-product-modal__variants">
                            {optionRows.map((row, index) => (
                                <div key={row.id} className="admin-product-modal__variant-row admin-product-modal__variant-row--edit">
                                    {pricingMode === 'persons' ? (
                                        <label className="admin-product-modal__person-field">
                                            <input
                                                className="stats-modal-input"
                                                inputMode="numeric"
                                                value={row.label}
                                                onChange={(e) => updateRow(row.id, { label: e.target.value.replace(/[^\d]/g, '') })}
                                                aria-label={`Antal personer, alternativ ${index + 1}`}
                                                placeholder="2"
                                            />
                                            <span>personer</span>
                                        </label>
                                    ) : (
                                        <input
                                            className="stats-modal-input"
                                            list="admin-weight-presets"
                                            value={row.label}
                                            onChange={(e) => updateRow(row.id, { label: e.target.value })}
                                            placeholder="t.ex. 250 gram"
                                            aria-label={`Vikt ${index + 1}`}
                                        />
                                    )}
                                    <input
                                        className="stats-modal-input"
                                        inputMode="decimal"
                                        value={row.priceKr}
                                        onChange={(e) => updateRow(row.id, { priceKr: e.target.value })}
                                        placeholder="kr"
                                        aria-label={`Pris, alternativ ${index + 1}`}
                                    />
                                    <button
                                        type="button"
                                        className="admin-product-modal__remove"
                                        onClick={() => setOptionRows((prev) => prev.filter((item) => item.id !== row.id))}
                                        disabled={saving || optionRows.length <= 1}
                                    >
                                        Ta bort
                                    </button>
                                </div>
                            ))}
                        </div>
                        {pricingMode === 'weight' && (
                            <datalist id="admin-weight-presets">
                                {WEIGHT_PRESETS.map((preset) => (
                                    <option key={preset} value={preset} />
                                ))}
                            </datalist>
                        )}
                        <button
                            type="button"
                            className="admin-product-modal__add"
                            onClick={addOptionRow}
                            disabled={saving || optionRows.length >= MAX_VARIANT_OPTIONS}
                        >
                            {pricingMode === 'persons' ? '+ Lägg till personantal' : '+ Lägg till vikt'}
                        </button>
                    </>
                )}

                <label className="form-label" htmlFor="admin-product-desc">Beskrivning (valfritt)</label>
                <DescriptionEditor
                    value={isNew ? '' : product.description ?? ''}
                    onChange={setDescription}
                    disabled={saving}
                />
                {isNew && (
                    <>
                        <label className="form-label">Bild (valfritt)</label>
                        {preview && (
                            <div className="admin-product-modal__preview">
                                <img src={preview} alt="" />
                            </div>
                        )}
                        <input
                            className="stats-modal-input"
                            type="file"
                            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                            onChange={(e) => handleFile(e.target.files?.[0])}
                        />
                    </>
                )}
                {formError && <p className="stats-modal-error">{formError}</p>}
                <div className="stats-modal-actions">
                    <Button variant="ghost" onClick={onClose} style={{ flex: 1 }} disabled={saving}>Avbryt</Button>
                    <Button variant="primary" onClick={() => void handleSave()} style={{ flex: 1 }} disabled={saving}>
                        {saving ? 'Sparar…' : 'Spara'}
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
}

function ProductPriceLines({ product }: { product: Product }) {
    const fields = getEditablePriceFields(product);
    if (!fields.length) {
        return <p className="admin-menu-card__price">{formatPriceKr(product.price)} kr</p>;
    }
    return (
        <ul className="admin-menu-card__prices">
            {fields.map((field) => (
                <li key={field.key}>
                    <span>{field.label}</span>
                    <span>{formatPriceKr(field.ore)} kr</span>
                </li>
            ))}
        </ul>
    );
}

function ProductCard({
    product,
    isFirst,
    isLast,
    isDragging,
    isDropTarget,
    onEdit,
    onDelete,
    onUpdated,
    onError,
    onMoveUp,
    onMoveDown,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
}: {
    product: Product;
    isFirst: boolean;
    isLast: boolean;
    isDragging: boolean;
    isDropTarget: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onUpdated: (product: Product) => void;
    onError: (message: string) => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onDragStart: (event: DragEvent<HTMLElement>) => void;
    onDragOver: (event: DragEvent<HTMLElement>) => void;
    onDrop: (event: DragEvent<HTMLElement>) => void;
    onDragEnd: () => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const cardRef = useRef<HTMLElement>(null);
    const [busy, setBusy] = useState(false);

    const handleFile = async (file: File | undefined) => {
        if (!file) return;
        if (file.size > MAX_BYTES) {
            onError('Bilden är för stor (max 4 MB).');
            return;
        }
        setBusy(true);
        try {
            const result = await adminApi.uploadImage('product', file, product.id);
            if (result.product) onUpdated(result.product);
        } catch (err) {
            onError(uploadErrorMessage(err));
        } finally {
            setBusy(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const handleToggleHidden = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const updated = await productApi.update(product.id, { hidden: !product.hidden });
            onUpdated(updated);
        } catch (err) {
            onError(productErrorMessage(err, 'Kunde inte uppdatera synligheten. Försök igen.'));
        } finally {
            setBusy(false);
        }
    };

    const handleGripDragStart = (event: DragEvent<HTMLElement>) => {
        const card = cardRef.current;
        if (card) {
            const rect = card.getBoundingClientRect();
            event.dataTransfer.setDragImage(card, event.clientX - rect.left, event.clientY - rect.top);
        }
        onDragStart(event);
    };

    return (
        <article
            ref={cardRef}
            className={`admin-menu-card${isDragging ? ' is-dragging' : ''}${isDropTarget ? ' is-drop-target' : ''}${product.hidden ? ' is-hidden-product' : ''}`}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
        >
            <div className="admin-menu-card__top">
                <button
                    type="button"
                    className="admin-menu-card__grip"
                    draggable
                    onDragStart={handleGripDragStart}
                    aria-label="Dra för att flytta"
                    title="Dra för att flytta"
                >
                    <GripVertical size={18} />
                    <span>Dra</span>
                </button>
                <div className="admin-menu-card__order-btns">
                    <button
                        type="button"
                        className={`admin-menu-card__visibility${product.hidden ? ' is-off' : ''}`}
                        onClick={() => void handleToggleHidden()}
                        disabled={busy}
                        aria-pressed={!product.hidden}
                        aria-label={product.hidden ? 'Visa på menyn' : 'Göm från menyn'}
                        title={product.hidden ? 'Visa på menyn' : 'Göm från menyn'}
                    >
                        {product.hidden ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                    <button type="button" className="admin-menu-card__order-btn" onClick={onMoveUp} disabled={isFirst || busy} aria-label="Flytta upp">↑</button>
                    <button type="button" className="admin-menu-card__order-btn" onClick={onMoveDown} disabled={isLast || busy} aria-label="Flytta ner">↓</button>
                </div>
            </div>
            <div className="admin-menu-card__image">
                <img src={product.image} alt="" draggable={false} />
                {busy && <div className="hero-upload-card__overlay">Laddar upp…</div>}
            </div>
            <h3 className="admin-menu-card__name">{product.name}</h3>
            <ProductPriceLines product={product} />
            <div className="admin-menu-card__actions">
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    hidden
                    disabled={busy}
                    onChange={(e) => void handleFile(e.target.files?.[0])}
                />
                <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
                    Byt bild
                </Button>
                <Button variant="secondary" size="sm" onClick={onEdit} disabled={busy}>
                    Ändra
                </Button>
                <Button variant="ghost" size="sm" className="admin-menu-card__delete" onClick={onDelete} disabled={busy}>
                    Ta bort
                </Button>
            </div>
        </article>
    );
}

export function MenuTab({
    settings,
    products,
    loadingProducts,
    onSettingsChange,
    onProductsChange,
    onError,
}: {
    settings: AdminSettings | null;
    products: Product[];
    loadingProducts: boolean;
    onSettingsChange: (settings: AdminSettings) => void;
    onProductsChange: (products: Product[]) => void;
    onError: (message: string) => void;
}) {
    const [formProduct, setFormProduct] = useState<Product | 'new' | null>(null);
    const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [dragId, setDragId] = useState<string | null>(null);
    const [dropId, setDropId] = useState<string | null>(null);
    const [savingOrder, setSavingOrder] = useState(false);
    const sorted = useMemo(() => sortProducts(products), [products]);

    const upsertProduct = (next: Product) => {
        const without = products.filter((p) => p.id !== next.id);
        onProductsChange(sortProducts([...without, next]));
    };

    const persistOrder = async (nextList: Product[]) => {
        const previous = products;
        const ordered = nextList.map((product, index) => ({ ...product, sortOrder: index + 1 }));
        onProductsChange(ordered);
        setSavingOrder(true);
        try {
            const saved = await productApi.reorder(ordered.map((product) => product.id));
            onProductsChange(sortProducts(saved));
        } catch (err) {
            onProductsChange(previous);
            onError(productErrorMessage(err, 'Kunde inte spara ordningen. Försök igen.'));
        } finally {
            setSavingOrder(false);
        }
    };

    const moveProduct = (fromIndex: number, toIndex: number) => {
        if (toIndex < 0 || toIndex >= sorted.length || fromIndex === toIndex) return;
        const next = [...sorted];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        void persistOrder(next);
    };

    const handleDelete = async () => {
        if (!deleteProduct || deleting) return;
        setDeleting(true);
        try {
            await productApi.remove(deleteProduct.id);
            onProductsChange(products.filter((p) => p.id !== deleteProduct.id));
            setDeleteProduct(null);
        } catch (err) {
            onError(productErrorMessage(err, 'Kunde inte ta bort varan. Försök igen.'));
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="menu-tab">
            <h2 className="menu-tab__title">Startsidans bild</h2>
            {!settings ? (
                <p>Laddar…</p>
            ) : (
                <div className="hero-upload-grid">
                    <HeroSlot
                        title="Dator"
                        hint="Visas på dator"
                        variant="desktop"
                        kind="hero-desktop"
                        imageUrl={settings.heroImageDesktop || DEFAULT_HERO_DESKTOP}
                        disabled={false}
                        onUploaded={onSettingsChange}
                        onError={onError}
                    />
                    <HeroSlot
                        title="Mobil"
                        hint="Visas på telefon"
                        variant="mobile"
                        kind="hero-mobile"
                        imageUrl={settings.heroImageMobile || DEFAULT_HERO_MOBILE}
                        disabled={false}
                        onUploaded={onSettingsChange}
                        onError={onError}
                    />
                </div>
            )}

            <div className="admin-menu-toolbar">
                <h2 className="menu-tab__title">Varor</h2>
                <Button variant="primary" onClick={() => setFormProduct('new')}>
                    + Lägg till vara
                </Button>
            </div>

            {loadingProducts ? (
                <p>Laddar varor…</p>
            ) : (
                <div className={`admin-menu-grid${savingOrder ? ' is-saving' : ''}`}>
                    {sorted.map((product, index) => (
                        <ProductCard
                            key={product.id}
                            product={product}
                            isFirst={index === 0}
                            isLast={index === sorted.length - 1}
                            isDragging={dragId === product.id}
                            isDropTarget={dropId === product.id && dragId !== product.id}
                            onEdit={() => setFormProduct(product)}
                            onDelete={() => setDeleteProduct(product)}
                            onUpdated={upsertProduct}
                            onError={onError}
                            onMoveUp={() => moveProduct(index, index - 1)}
                            onMoveDown={() => moveProduct(index, index + 1)}
                            onDragStart={(event) => {
                                event.dataTransfer.effectAllowed = 'move';
                                event.dataTransfer.setData('text/plain', product.id);
                                setDragId(product.id);
                            }}
                            onDragOver={(event) => {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = 'move';
                                if (dropId !== product.id) setDropId(product.id);
                            }}
                            onDrop={(event) => {
                                event.preventDefault();
                                const fromId = event.dataTransfer.getData('text/plain') || dragId;
                                setDragId(null);
                                setDropId(null);
                                if (!fromId || fromId === product.id) return;
                                const fromIndex = sorted.findIndex((item) => item.id === fromId);
                                const toIndex = sorted.findIndex((item) => item.id === product.id);
                                moveProduct(fromIndex, toIndex);
                            }}
                            onDragEnd={() => {
                                setDragId(null);
                                setDropId(null);
                            }}
                        />
                    ))}
                </div>
            )}

            {formProduct && (
                <ProductFormModal
                    key={formProduct === 'new' ? 'new' : formProduct.id}
                    product={formProduct}
                    onClose={() => setFormProduct(null)}
                    onSaved={(product) => {
                        upsertProduct(product);
                        setFormProduct(null);
                    }}
                    onError={onError}
                />
            )}
            {deleteProduct && createPortal(
                <div className="stats-modal-overlay" onClick={() => !deleting && setDeleteProduct(null)}>
                    <div className="stats-modal" onClick={(e) => e.stopPropagation()}>
                        <h2>Ta bort vara</h2>
                        <p>
                            Vill du ta bort “{deleteProduct.name}”? Den försvinner från menyn. Detta går inte att ångra.
                        </p>
                        <div className="stats-modal-actions">
                            <Button variant="ghost" onClick={() => setDeleteProduct(null)} style={{ flex: 1 }} disabled={deleting}>
                                Avbryt
                            </Button>
                            <Button variant="primary" onClick={() => void handleDelete()} style={{ flex: 1 }} disabled={deleting}>
                                {deleting ? 'Tar bort…' : 'Ta bort'}
                            </Button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
