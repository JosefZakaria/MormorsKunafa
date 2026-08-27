import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical } from 'lucide-react';
import { ApiError } from '@shared/api';
import type { AdminSettings, Product } from '@shared/types';
import { Button } from '../../../components/common/Button/Button';
import { adminApi, productApi } from '../../../services/api';
import { getEditablePriceFields } from '../../../utils/productVariantPrices';
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
    const priceFields = isNew ? [] : getEditablePriceFields(product);
    const [name, setName] = useState(isNew ? '' : product.name);
    const [priceKr, setPriceKr] = useState(isNew ? '' : formatPriceKr(product.price));
    const [variantPricesKr, setVariantPricesKr] = useState<Record<string, string>>(() => {
        const next: Record<string, string> = {};
        for (const field of priceFields) next[field.key] = formatPriceKr(field.ore);
        return next;
    });
    const [description, setDescription] = useState(
        isNew ? '' : prepareDescriptionHtml(product.description ?? '')
    );
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(isNew ? null : product.image);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

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
        let variantPrices: Record<string, number> | undefined;
        if (priceFields.length > 0) {
            variantPrices = {};
            for (const field of priceFields) {
                const ore = parsePriceKrToOre(variantPricesKr[field.key] ?? '');
                if (ore == null) {
                    setFormError(`Ange ett giltigt pris för ${field.label}.`);
                    return;
                }
                variantPrices[field.key] = ore;
            }
            priceOre = Math.min(...Object.values(variantPrices));
        } else {
            const parsed = parsePriceKrToOre(priceKr);
            if (parsed == null) {
                setFormError('Ange ett giltigt pris i kronor.');
                return;
            }
            priceOre = parsed;
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
                });
                onSaved(created, 'create');
            } else {
                const updated = await productApi.update(product.id, {
                    name: trimmed,
                    price: priceOre,
                    description: sanitizeDescriptionHtml(description),
                    ...(variantPrices ? { variantPrices } : {}),
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
                {priceFields.length > 0 ? (
                    <>
                        <p className="form-label">Priser (kr)</p>
                        <div className="admin-product-modal__variants">
                            {priceFields.map((field) => (
                                <div key={field.key} className="admin-product-modal__variant-row">
                                    <label htmlFor={`admin-product-price-${field.key}`}>{field.label}</label>
                                    <input
                                        id={`admin-product-price-${field.key}`}
                                        className="stats-modal-input"
                                        inputMode="decimal"
                                        value={variantPricesKr[field.key] ?? ''}
                                        onChange={(e) =>
                                            setVariantPricesKr((prev) => ({ ...prev, [field.key]: e.target.value }))
                                        }
                                        placeholder="1"
                                    />
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
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
            className={`admin-menu-card${isDragging ? ' is-dragging' : ''}${isDropTarget ? ' is-drop-target' : ''}`}
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

    return (
        <div className="menu-tab">
            <h2 className="menu-tab__title">Startsidans bild</h2>
            <p className="menu-tab__lead">
                Tryck på en bild för att byta den. Ändringen syns direkt på startsidan.
            </p>
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
                <div>
                    <h2 className="menu-tab__title">Varor</h2>
                    <p className="menu-tab__lead">
                        Dra korten för att ändra ordningen. Tryck på Ändra för att sätta pris per vikt eller storlek.
                    </p>
                </div>
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
        </div>
    );
}
