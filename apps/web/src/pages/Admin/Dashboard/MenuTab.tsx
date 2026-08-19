import { useMemo, useRef, useState } from 'react';
import { ApiError } from '@shared/api';
import type { AdminSettings, Product } from '@shared/types';
import { Button } from '../../../components/common/Button/Button';
import { useLanguage } from '../../../contexts/LanguageContext';
import { adminApi, productApi } from '../../../services/api';
import { getDisplayName } from '../../../utils/productDisplayName';

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
    const [name, setName] = useState(isNew ? '' : product.name);
    const [priceKr, setPriceKr] = useState(isNew ? '' : formatPriceKr(product.price));
    const [description, setDescription] = useState(isNew ? '' : product.description ?? '');
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
        const priceOre = parsePriceKrToOre(priceKr);
        if (priceOre == null) {
            setFormError('Ange ett giltigt pris i kronor.');
            return;
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
                    description: description.trim(),
                    image,
                });
                onSaved(created, 'create');
            } else {
                const updated = await productApi.update(product.id, {
                    name: trimmed,
                    price: priceOre,
                    description: description.trim(),
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

    return (
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
                <label className="form-label" htmlFor="admin-product-price">Pris (kr)</label>
                <input
                    id="admin-product-price"
                    className="stats-modal-input"
                    inputMode="decimal"
                    value={priceKr}
                    onChange={(e) => setPriceKr(e.target.value)}
                    placeholder="149"
                />
                <label className="form-label" htmlFor="admin-product-desc">Beskrivning (valfritt)</label>
                <textarea
                    id="admin-product-desc"
                    className="stats-modal-input"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
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
        </div>
    );
}

function ProductCard({
    product,
    onEdit,
    onUpdated,
    onError,
}: {
    product: Product;
    onEdit: () => void;
    onUpdated: (product: Product) => void;
    onError: (message: string) => void;
}) {
    const { t } = useLanguage();
    const inputRef = useRef<HTMLInputElement>(null);
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

    return (
        <article className="admin-menu-card">
            <div className="admin-menu-card__image">
                <img src={product.image} alt="" />
                {busy && <div className="hero-upload-card__overlay">Laddar upp…</div>}
            </div>
            <h3 className="admin-menu-card__name">{getDisplayName(product, t)}</h3>
            <p className="admin-menu-card__price">{formatPriceKr(product.price)} kr</p>
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
    const sorted = useMemo(() => sortProducts(products), [products]);

    const upsertProduct = (next: Product) => {
        const without = products.filter((p) => p.id !== next.id);
        onProductsChange(sortProducts([...without, next]));
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
                    <p className="menu-tab__lead">Lägg till en vara eller byt bild, namn och pris.</p>
                </div>
                <Button variant="primary" onClick={() => setFormProduct('new')}>
                    + Lägg till vara
                </Button>
            </div>

            {loadingProducts ? (
                <p>Laddar varor…</p>
            ) : (
                <div className="admin-menu-grid">
                    {sorted.map((product) => (
                        <ProductCard
                            key={product.id}
                            product={product}
                            onEdit={() => setFormProduct(product)}
                            onUpdated={upsertProduct}
                            onError={onError}
                        />
                    ))}
                </div>
            )}

            {formProduct && (
                <ProductFormModal
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
