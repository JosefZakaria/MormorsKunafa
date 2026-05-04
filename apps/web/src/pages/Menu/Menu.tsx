import React, { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { Container } from '../../components/common/Container/Container';
import { Button } from '../../components/common/Button/Button';
import { useLanguage } from '../../contexts/LanguageContext';
import { useCart } from '../../contexts/CartContext';
import { useToast } from '../../contexts/ToastContext';
import { productApi } from '../../services/api';
import type { Product } from '@shared/types';
import { getDisplayName, getTranslationIndex } from '../../utils/productDisplayName';
import './Menu.css';

const SHORT_DESC_LENGTH = 100;

function stripHtmlAndTruncate(html: string, maxLen: number): string {
    const div = typeof document !== 'undefined' ? document.createElement('div') : null;
    if (!div) return html.replace(/<[^>]*>/g, '').slice(0, maxLen).trim();
    div.innerHTML = html;
    const text = (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen).trim() + '…';
}

/** Remove escaped quotes (e.g. \\"ashta\\" from API) so text shows as ashta. */
function stripEscapedQuotes(html: string): string {
    if (!html || typeof html !== 'string') return html;
    return html.replace(/\\"/g, '');
}

/** Replace literal \r\n and real newlines with <br> so they don't show as text. */
function normalizeLineBreaks(html: string): string {
    if (!html || typeof html !== 'string') return html;
    return html
        // Handle double-escaped (e.g. from JSON/DB: "\\\\r\\\\n" -> backslash+r+backslash+n)
        .replace(/\\\\r\\\\n/g, '<br>')
        .replace(/\\\\n/g, '<br>')
        .replace(/\\\\r/g, '<br>')
        // Handle literal backslash-r-backslash-n in string (one backslash each)
        .replace(/\\r\\n/g, '<br>')
        .replace(/\\n/g, '<br>')
        .replace(/\\r/g, '<br>')
        // Handle actual newline characters
        .replace(/\r\n/g, '<br>')
        .replace(/\n/g, '<br>')
        .replace(/\r/g, '<br>');
}

/** Strip newlines and \r\n for plain-text display (e.g. truncated fallback). */
function normalizeLineBreaksToSpaces(text: string): string {
    if (!text || typeof text !== 'string') return text;
    return normalizeLineBreaks(text).replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
}

/** Convert common header patterns like <p><strong>För vem?</strong></p> to <h3>För vem?</h3> for proper spacing. */
function normalizeHeaders(html: string): string {
    if (!html || typeof html !== 'string') return html;
    // Convert <p><strong>För vem?</strong></p> or similar header patterns to <h3>
    // Also handles cases with <br> tags: <p><strong>För vem?</strong><br /></p>
    return html
        .replace(
            /<p[^>]*>\s*<strong[^>]*>(För vem\?|For whom\?|Who is it for\?|لمن هذا المنتج\?|لمن|Vem är den för\?|Vem passar den för\?)<\/strong>\s*(<br\s*\/?>)?\s*<\/p>/gi,
            '<h3>$1</h3>'
        )
        .replace(
            /<p[^>]*>\s*<strong[^>]*>(För vem\?|For whom\?|Who is it for\?|لمن هذا المنتج\?|لمن|Vem är den för\?|Vem passar den för\?)<\/strong>\s*<br\s*\/?>\s*/gi,
            '<h3>$1</h3>'
        );
}

function sanitizeHtml(html: string): string {
    return DOMPurify.sanitize(
        normalizeHeaders(normalizeLineBreaks(stripEscapedQuotes(html))),
        { ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'h3', 'ul', 'li', 'span'] }
    );
}

/** Remove leading <strong>displayName</strong><br /> so the modal doesn't repeat the product name (match Kunafa layout). */
function stripLeadingProductName(html: string, displayName: string): string {
    if (!html || !displayName) return html;
    const escaped = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(
        `^\\s*<strong[^>]*>\\s*${escaped}\\s*</strong>\\s*(<br\\s*/?>\\s*)?`,
        'i'
    );
    return html.replace(re, '').trim();
}

/** Product id to exclude from menu (Mormors Box – En Gåva av äkta Smaker). */
const MENU_EXCLUDE_PRODUCT_IDS = new Set(['f05b6a24-7b90-4dfb-8f2f-be67a475cbfa']);

/** Products that are sold only in one fixed weight (no dropdown). */
const FIXED_WEIGHT_BY_INDEX: Record<string, string> = {
    '12': '1 kg',      // Mormorsbox - BaklawaMix
    '14': '1350 gram', // Pistagemix
};

function getFixedWeight(product: Product): string | null {
    const idx = getTranslationIndex(product);
    if (idx && FIXED_WEIGHT_BY_INDEX[idx]) return FIXED_WEIGHT_BY_INDEX[idx];
    return null;
}

/** Translated short description when we have a translation index; else normalized API description (no raw \r\n). */
function getDisplayShortDesc(product: Product, t: (key: string) => string): string {
    const idx = getTranslationIndex(product);
    if (idx) {
        const translated = t(`products.${idx}.desc`);
        if (translated !== `products.${idx}.desc`) return translated;
    }
    const byKey = t(`products.${product.id}.desc`);
    if (byKey !== `products.${product.id}.desc`) return byKey;
    const raw = product.description || '';
    const text = stripHtmlAndTruncate(raw, 10000);
    const normalized = normalizeLineBreaksToSpaces(text);
    return normalized.length <= SHORT_DESC_LENGTH
        ? normalized
        : normalized.slice(0, SHORT_DESC_LENGTH).trim() + '…';
}

// Mock products fallback (when backend is not available)
const getMockProducts = (t: (key: string) => string): Product[] => {
    const now = new Date().toISOString();
    return [
        {
            id: '1',
            name: t('products.1.name'),
            price: 12900, // 129 kr in öre
            description: t('products.1.desc'),
            image: '/images/pistage-baklawa.jpg',
            inStock: true,
            createdAt: now,
            updatedAt: now,
        },
        {
            id: '2',
            name: t('products.2.name'),
            price: 12900,
            description: t('products.2.desc'),
            image: '/images/walnut-baklawa.jpg',
            inStock: true,
            createdAt: now,
            updatedAt: now,
        },
        {
            id: '3',
            name: t('products.3.name'),
            price: 11900,
            description: t('products.3.desc'),
            image: '/images/finmald-kunafa.jpg',
            inStock: true,
            createdAt: now,
            updatedAt: now,
        },
        {
            id: '4',
            name: t('products.4.name'),
            price: 8500,
            description: t('products.4.desc'),
            image: '/images/kaake-kunafa.jpg',
            inStock: true,
            createdAt: now,
            updatedAt: now,
        },
        {
            id: '5',
            name: t('products.5.name'),
            price: 11900,
            description: t('products.5.desc'),
            image: '/images/kunafa-ashta.jpg',
            inStock: true,
            createdAt: now,
            updatedAt: now,
        },
        {
            id: '6',
            name: t('products.6.name'),
            price: 13900,
            description: t('products.6.desc'),
            image: '/images/harise-ashta.jpg',
            inStock: true,
            createdAt: now,
            updatedAt: now,
        },
        {
            id: '7',
            name: t('products.7.name'),
            price: 14900,
            description: t('products.7.desc'),
            image: '/images/ostkaka.jpg',
            inStock: true,
            createdAt: now,
            updatedAt: now,
        },
        {
            id: '8',
            name: t('products.8.name'),
            price: 11900,
            description: t('products.8.desc'),
            image: '/images/krispig-kunafa.jpg',
            inStock: true,
            createdAt: now,
            updatedAt: now,
        },
    ];
};

export const Menu: React.FC = () => {
    const { t, language } = useLanguage();
    const { addItem } = useCart();
    const { showToast } = useToast();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [usingMockData, setUsingMockData] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [selectedOption, setSelectedOption] = useState<string>('');
    const tRef = useRef(t);

    useEffect(() => {
        if (selectedProduct) {
            const fixed = getFixedWeight(selectedProduct);
            setSelectedOption(fixed ?? '');
        }
    }, [selectedProduct]);
    tRef.current = t;

    // Fetch products once on mount so a refetch (e.g. from t changing) can't overwrite real data
    useEffect(() => {
        let cancelled = false;
        const fetchProducts = async () => {
            try {
                setLoading(true);
                setError(null);
                setUsingMockData(false);
                const data = await productApi.getAll();
                if (!cancelled) {
                    setProducts(data.filter((p) => !MENU_EXCLUDE_PRODUCT_IDS.has(p.id)));
                }
            } catch (err) {
                if (cancelled) return;
                console.warn('API not available, using mock data:', err);
                setUsingMockData(true);
                setProducts(getMockProducts(tRef.current));
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchProducts();
        return () => { cancelled = true; };
    }, []);

    const handleAddToCart = (product: Product, option: string) => {
        if (!product.inStock) {
            alert('Denna produkt är tyvärr slut i lager.');
            return;
        }
        addItem(product, 1, option);
        showToast(t('menu.added_to_cart').replace('{name}', getDisplayName(product, t)), 'success');
    };

    if (loading) {
        return (
            <div className="menu-page animate-in">
                <Container>
                    <div className="text-center py-12">
                        <p className="text-body-lg">Laddar meny...</p>
                    </div>
                </Container>
            </div>
        );
    }

    if (error && !usingMockData) {
        return (
            <div className="menu-page animate-in">
                <Container>
                    <div className="text-center py-12">
                        <p className="text-body-lg text-error">{error}</p>
                        <Button variant="primary" onClick={() => window.location.reload()}>
                            Försök igen
                        </Button>
                    </div>
                </Container>
            </div>
        );
    }

    return (
        <>
            <div className="menu-page animate-in">
                <Container>
                    {usingMockData && (
                        <header className="menu-page__header">
                            <p className="text-center text-body-sm menu-page__demo-notice">
                                (Demo-läge: Använder testdata)
                            </p>
                        </header>
                    )}

                    <div className="menu-grid">
                        {products.map((product) => (
                            <div
                                key={product.id}
                                className={`menu-item-simple ${!product.inStock ? 'menu-item--out-of-stock' : ''}`}
                            >
                                <div
                                    className="menu-item-simple__clickable"
                                    onClick={() => setSelectedProduct(product)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            setSelectedProduct(product);
                                        }
                                    }}
                                >
                                    <div className="menu-item-simple__image-container">
                                        <img src={product.image} alt={getDisplayName(product, t)} className="menu-item-simple__image" />
                                        {!product.inStock && (
                                            <div className="menu-item-simple__out-of-stock-badge">
                                                {t('menu.out_of_stock')}
                                            </div>
                                        )}
                                    </div>
                                    <div className="menu-item-simple__content">
                                        <h3 className="menu-item-simple__title">
                                            {getDisplayName(product, t)}
                                        </h3>
                                    </div>
                                </div>
                                <div className="menu-item-simple__actions">
                                    <Button
                                        variant="primary"
                                        fullWidth
                                        size="sm"
                                        className="menu-item-simple__btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedProduct(product);
                                        }}
                                        disabled={!product.inStock}
                                    >
                                        {product.inStock
                                            ? (getFixedWeight(product) ? 'Visa produkt' : 'Välj alternativ')
                                            : t('menu.out_of_stock')}
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </Container>
            </div>

            {selectedProduct && (
                <div
                    className="menu-modal-overlay"
                    onClick={() => setSelectedProduct(null)}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="menu-modal-title"
                >
                    <div
                        key={`modal-${selectedProduct.id}-${language}`}
                        className="menu-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            className="menu-modal__close"
                            onClick={() => setSelectedProduct(null)}
                            aria-label={t('modal.close')}
                        >
                            ×
                        </button>
                        <div className="menu-modal__top-row">
                            <div className="menu-modal__image-wrap">
                                <img
                                    src={selectedProduct.image}
                                    alt={getDisplayName(selectedProduct, t)}
                                    className="menu-modal__image"
                                />
                            </div>
                            <div className="menu-modal__options-box">
                                {(() => {
                                    const fixedWeight = getFixedWeight(selectedProduct);
                                    if (fixedWeight) {
                                        return (
                                            <>
                                                <label className="menu-modal__options-label">Vikt</label>
                                                <div className="menu-modal__fixed-weight">{fixedWeight}</div>
                                            </>
                                        );
                                    }
                                    const isCountBased = /kunafa|ostkaka/i.test(selectedProduct.name);
                                    return (
                                        <>
                                            <label className="menu-modal__options-label">
                                                {isCountBased ? 'Välj antal' : 'Välj vikt'}
                                            </label>
                                            <select
                                                className="menu-modal__select"
                                                value={selectedOption}
                                                onChange={(e) => setSelectedOption(e.target.value)}
                                            >
                                                <option value="" disabled>Välj...</option>
                                                {(isCountBased
                                                    ? ['2 personer', '4 personer']
                                                    : ['250 gram', '500 gram', '1 kg']
                                                ).map((opt) => (
                                                    <option key={opt} value={opt}>{opt}</option>
                                                ))}
                                            </select>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                        <div className="menu-modal__body">
                            <h2 id="menu-modal-title" className="text-heading-md menu-modal__title">
                                {getDisplayName(selectedProduct, t)}
                            </h2>
                            <p className="menu-modal__price">
                                {(selectedProduct.price / 100).toFixed(0)} kr
                            </p>
                            {(() => {
                                const sanitizedApiDescription = sanitizeHtml(selectedProduct.description || '');
                                const idx = getTranslationIndex(selectedProduct);

                                if (language === 'sv') {
                                    const descriptionHtml = stripLeadingProductName(
                                        sanitizedApiDescription,
                                        getDisplayName(selectedProduct, t)
                                    );
                                    return (
                                        <div
                                            className="menu-modal__description text-body-sm"
                                            dangerouslySetInnerHTML={{
                                                __html: descriptionHtml,
                                            }}
                                        />
                                    );
                                }
                                // English/Arabic: prefer full translated description (desc_long), then short (desc), then API
                                if (idx) {
                                    const longKey = `products.${idx}.desc_long`;
                                    const longHtml = t(longKey);
                                    if (longHtml !== longKey && longHtml.trim()) {
                                        return (
                                            <div
                                                className="menu-modal__description text-body-sm"
                                                dangerouslySetInnerHTML={{
                                                    __html: sanitizeHtml(longHtml),
                                                }}
                                            />
                                        );
                                    }
                                    const shortKey = `products.${idx}.desc`;
                                    if (t(shortKey) !== shortKey) {
                                        return (
                                            <div className="menu-modal__description text-body-sm">
                                                <p>{getDisplayShortDesc(selectedProduct, t)}</p>
                                            </div>
                                        );
                                    }
                                }
                                const descriptionHtml = stripLeadingProductName(
                                    sanitizedApiDescription,
                                    getDisplayName(selectedProduct, t)
                                );
                                return (
                                    <div
                                        className="menu-modal__description text-body-sm"
                                        dangerouslySetInnerHTML={{
                                            __html: descriptionHtml,
                                        }}
                                    />
                                );
                            })()}
                        </div>
                        <div className="menu-modal__footer">
                            <Button
                                variant="primary"
                                fullWidth
                                className="menu-modal__btn"
                                onClick={() => {
                                    if (!selectedOption) return;
                                    handleAddToCart(selectedProduct, selectedOption);
                                    setSelectedProduct(null);
                                }}
                                disabled={!selectedProduct.inStock || !selectedOption}
                            >
                                {selectedProduct.inStock
                                    ? selectedOption ? t('menu.add_to_cart') : 'Välj ett alternativ'
                                    : t('menu.out_of_stock')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
