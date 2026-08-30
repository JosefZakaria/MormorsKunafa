import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container } from '../../components/common/Container/Container';
import { Button } from '../../components/common/Button/Button';
import { useLanguage } from '../../contexts/LanguageContext';
import { useCart } from '../../contexts/CartContext';
import { productApi } from '../../services/api';
import { API_CONFIG } from '@shared/api';
import { resolveProductImage } from '@shared/utils/productImage.ts';
import type { Product } from '@shared/types';
import { getTranslationIndex } from '../../utils/productDisplayName';
import {
    formatBreadOption,
    getBreadDisplayPriceOre,
    getBreadUnitPriceOre,
    getDisplayPriceOre,
    getFixedWeight,
    getOptionSelectorType,
    getProductOptions,
    hasVariantPricing,
    isBreadProduct,
    isMenuExcluded,
} from '../../utils/productVariantPrices';
import './Menu.css';
import { AllergenNotice } from '../../components/common/AllergenNotice/AllergenNotice';
import {
    normalizeLineBreaks,
    prepareDescriptionHtml,
} from '../../utils/productDescriptionHtml';
import { getStoredLocationId, needsPickupLocation, stockLocationIdForCustomer } from '../../utils/selectedLocation';

const SHORT_DESC_LENGTH = 100;

function stripHtmlAndTruncate(html: string, maxLen: number): string {
    const div = typeof document !== 'undefined' ? document.createElement('div') : null;
    if (!div) return html.replace(/<[^>]*>/g, '').slice(0, maxLen).trim();
    div.innerHTML = html;
    const text = (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen).trim() + '…';
}

function normalizeLineBreaksToSpaces(text: string): string {
    if (!text || typeof text !== 'string') return text;
    return normalizeLineBreaks(text).replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
}

function sanitizeHtml(html: string): string {
    return prepareDescriptionHtml(html);
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

// Mock products fallback (when backend is not available) — real UUIDs for variant pricing
const getMockProducts = (t: (key: string) => string): Product[] => {
    const now = new Date().toISOString();
    const mock = (
        id: string,
        name: string,
        descKey: string,
        image: string,
        priceOre: number,
        sortOrder: number
    ): Product => ({
        id,
        name,
        price: priceOre,
        description: t(descKey),
        image,
        inStock: true,
        hidden: false,
        sortOrder,
        createdAt: now,
        updatedAt: now,
    });
    return [
        mock('1ae3fd7a-0042-4220-b330-b27b3147a0a6', 'Pistage Baklawa', 'products.1.desc', '/images/pistage-baklawa.jpg', 8900, 1),
        mock('054b4adf-4da3-42c0-aa9b-b939023aafad', 'Walnut Baklawa', 'products.2.desc', '/images/walnut-baklawa.jpg', 6900, 2),
        mock('77048580-fd68-454d-b34b-395b351a96d4', 'Finmald Kunafa', 'products.3.desc', '/images/finmald-kunafa.jpg', 14900, 3),
        mock('fc469599-82e8-4ea3-aa18-0436bc2a2afd', 'Ashta Baklawa', 'products.5.desc', '/images/kunafa-ashta.jpg', 14900, 4),
        mock('6c1efa0e-149c-4259-9bd0-f85fd35f4b62', 'Ostkaka (Halawet el Jibn)', 'products.7.desc', '/images/ostkaka.jpg', 7900, 5),
        mock('37b8b656-2604-4ca6-9745-e0d6f52338c1', 'Krispig Kunafa', 'products.8.desc', '/images/krispig-kunafa.jpg', 14900, 6),
        mock('856b591e-08b3-40ec-b505-cb3b143293bb', 'Bröd (kaek)', 'products.9.desc', '/images/kaake-kunafa.jpg', 1500, 7),
        mock('94fd4a72-2685-4bc4-8813-0f5e5eaa4a1c', 'Mad bel Ashta', 'products.11.desc', '/images/harise-ashta.jpg', 7900, 8),
        mock('c005c8af-3f2e-401c-923f-7dac0f682cda', 'Mormorsbox - BaklawaMix', 'products.12.desc', '/images/mormorsbox-mix.jpg', 29900, 9),
        mock('6312f48a-b156-431b-9f6d-103cc30bc9f8', 'Mamoul Pistage', 'products.13.desc', '/images/mamoul-pistage.jpg', 17900, 10),
        mock('9e6d210b-8637-4deb-889c-0726060288aa', 'Pistagemix', 'products.14.desc', '/images/pistagemix.jpg', 49900, 11),
    ];
};

export const Menu: React.FC = () => {
    const navigate = useNavigate();
    const { t, language } = useLanguage();
    const { addItem } = useCart();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [usingMockData, setUsingMockData] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [selectedOption, setSelectedOption] = useState<string>('');
    const [breadQuantity, setBreadQuantity] = useState(1);
    const tRef = useRef(t);

    useEffect(() => {
        if (selectedProduct) {
            const fixed = getFixedWeight(selectedProduct);
            if (isBreadProduct(selectedProduct)) {
                setBreadQuantity(1);
                setSelectedOption('');
            } else {
                setSelectedOption(fixed ?? '');
            }
        }
    }, [selectedProduct]);
    tRef.current = t;

    useEffect(() => {
        const orderType = sessionStorage.getItem('orderType');
        if (needsPickupLocation(orderType) && !getStoredLocationId()) {
            navigate('/select-location', { replace: true });
        }
    }, [navigate]);

    const stockLocationId = stockLocationIdForCustomer();

    // Fetch products once on mount so a refetch (e.g. from t changing) can't overwrite real data
    useEffect(() => {
        let cancelled = false;
        const fetchProducts = async () => {
            try {
                setLoading(true);
                setError(null);
                setUsingMockData(false);
                const data = await productApi.getAll(stockLocationId || undefined);
                if (!cancelled) {
                    setProducts(
                        data
                            .filter((p) => !isMenuExcluded(p) && !p.hidden)
                            .sort((a, b) => {
                                const order = (a.sortOrder || 0) - (b.sortOrder || 0);
                                if (order !== 0) return order;
                                return a.name.localeCompare(b.name, 'sv');
                            })
                            .map((p) => ({
                                ...p,
                                image: resolveProductImage(p.id, p.image),
                            }))
                    );
                }
            } catch (err) {
                if (cancelled) return;
                const message =
                    err instanceof Error ? err.message : 'Kunde inte hämta produkter';
                console.error('Failed to load products from API:', {
                    baseUrl: API_CONFIG.baseUrl,
                    err,
                });
                if (import.meta.env.PROD) {
                    setError(
                        `Kunde inte ladda menyn (${message}). Kontrollera API: ${API_CONFIG.baseUrl}`
                    );
                    setProducts([]);
                } else {
                    console.warn('API not available, using mock data:', err);
                    setUsingMockData(true);
                    setProducts(getMockProducts(tRef.current));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchProducts();
        return () => { cancelled = true; };
    }, [stockLocationId]);

    const handleAddToCart = (product: Product, option: string) => {
        if (!product.inStock) {
            alert('Denna produkt är tyvärr slut i lager.');
            return;
        }
        const fixed = getFixedWeight(product);
        const resolvedOption = option || fixed || undefined;

        // Try to trigger flying animation
        const imgEl = document.querySelector('.menu-modal__image') as HTMLImageElement;
        const cartEl = document.querySelector('.header__menu-btn--cart') as HTMLElement;

        if (imgEl && cartEl) {
            const imgRect = imgEl.getBoundingClientRect();
            const cartRect = cartEl.getBoundingClientRect();

            const flyer = document.createElement('img');
            flyer.src = imgEl.src;
            flyer.style.position = 'fixed';
            flyer.style.left = `${imgRect.left}px`;
            flyer.style.top = `${imgRect.top}px`;
            flyer.style.width = `${imgRect.width}px`;
            flyer.style.height = `${imgRect.height}px`;
            flyer.style.objectFit = 'cover';
            flyer.style.borderRadius = '50%';
            flyer.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.3)';
            flyer.style.zIndex = '99999';
            flyer.style.pointerEvents = 'none';
            flyer.style.transition = 'all 0.85s cubic-bezier(0.25, 1, 0.5, 1)';

            document.body.appendChild(flyer);

            // Force reflow
            void flyer.offsetWidth;

            // Target coordinates (middle of the cart icon)
            const targetX = cartRect.left + cartRect.width / 2 - 20;
            const targetY = cartRect.top + cartRect.height / 2 - 20;

            flyer.style.left = `${targetX}px`;
            flyer.style.top = `${targetY}px`;
            flyer.style.width = '40px';
            flyer.style.height = '40px';
            flyer.style.opacity = '0.1';

            setTimeout(() => {
                flyer.remove();

                // Trigger cart pop animation
                cartEl.classList.add('header__menu-btn--cart-pop');
                setTimeout(() => {
                    cartEl.classList.remove('header__menu-btn--cart-pop');
                }, 300);

                // Add to cart state
                addItem(product, 1, resolvedOption);
            }, 850);
        } else {
            // Fallback
            addItem(product, 1, resolvedOption);
        }
    };

    const selectedIsBread = selectedProduct ? isBreadProduct(selectedProduct) : false;
    const selectedSelectorType = selectedProduct ? getOptionSelectorType(selectedProduct) : null;
    const modalPriceOre = selectedProduct
        ? selectedIsBread
            ? getBreadDisplayPriceOre(selectedProduct, breadQuantity)
            : getDisplayPriceOre(selectedProduct, selectedOption)
        : 0;
    const canAddToCart =
        !!selectedProduct?.inStock &&
        (selectedIsBread ||
            !!selectedOption ||
            selectedSelectorType === 'fixed' ||
            selectedSelectorType === 'none');

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
                                        <img src={product.image} alt={product.name} className="menu-item-simple__image" />
                                        {!product.inStock && (
                                            <div className="menu-item-simple__out-of-stock-badge">
                                                {t('menu.out_of_stock')}
                                            </div>
                                        )}
                                    </div>
                                    <div className="menu-item-simple__content">
                                        <h3 className="menu-item-simple__title">
                                            {product.name}
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
                                            ? (getFixedWeight(product) || !hasVariantPricing(product)
                                                ? 'Visa produkt'
                                                : 'Välj alternativ')
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
                                    alt={selectedProduct.name}
                                    className="menu-modal__image"
                                />
                            </div>
                            {selectedSelectorType && selectedSelectorType !== 'none' && (
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
                                        if (selectedSelectorType === 'bread') {
                                            return (
                                                <>
                                                    <label className="menu-modal__options-label">Välj antal</label>
                                                    <div className="menu-modal__quantity" role="group" aria-label="Antal bröd">
                                                        <button
                                                            type="button"
                                                            className="menu-modal__quantity-btn"
                                                            onClick={() => setBreadQuantity((q) => Math.max(1, q - 1))}
                                                            disabled={breadQuantity <= 1}
                                                            aria-label="Minska antal"
                                                        >
                                                            −
                                                        </button>
                                                        <span className="menu-modal__quantity-value" aria-live="polite">
                                                            {breadQuantity}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            className="menu-modal__quantity-btn"
                                                            onClick={() => setBreadQuantity((q) => q + 1)}
                                                            aria-label="Öka antal"
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                </>
                                            );
                                        }
                                        const options = getProductOptions(selectedProduct);
                                        const label =
                                            selectedSelectorType === 'persons'
                                                ? 'Välj antal personer'
                                                : 'Välj vikt';
                                        return (
                                            <>
                                                <label className="menu-modal__options-label">{label}</label>
                                                <select
                                                    className="menu-modal__select"
                                                    value={selectedOption}
                                                    onChange={(e) => setSelectedOption(e.target.value)}
                                                >
                                                    <option value="" disabled>Välj...</option>
                                                    {options.map((opt) => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
                                            </>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                        <div className="menu-modal__body">
                            <h2 id="menu-modal-title" className="text-heading-md menu-modal__title">
                                {selectedProduct.name}
                            </h2>
                            <p className="menu-modal__price">
                                {(modalPriceOre / 100).toFixed(0)} kr
                                {selectedIsBread && breadQuantity > 1 && (
                                    <span className="menu-modal__price-detail">
                                        {' '}
                                        ({breadQuantity} × {(getBreadUnitPriceOre(selectedProduct) / 100).toFixed(0)} kr)
                                    </span>
                                )}
                            </p>
                            {(() => {
                                const sanitizedApiDescription = sanitizeHtml(selectedProduct.description || '');
                                const idx = getTranslationIndex(selectedProduct);

                                if (language === 'sv') {
                                    const descriptionHtml = stripLeadingProductName(
                                        sanitizedApiDescription,
                                        selectedProduct.name
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
                                    selectedProduct.name
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
                            <AllergenNotice />
                        </div>
                        <div className="menu-modal__footer">
                            <Button
                                variant="primary"
                                fullWidth
                                className="menu-modal__btn"
                                onClick={() => {
                                    const fixed = getFixedWeight(selectedProduct);
                                    const option = selectedIsBread
                                        ? formatBreadOption(breadQuantity)
                                        : selectedOption || fixed || '';
                                    if (
                                        (selectedSelectorType === 'weight' || selectedSelectorType === 'persons') &&
                                        !option
                                    ) {
                                        return;
                                    }
                                    handleAddToCart(selectedProduct, option);
                                    setSelectedProduct(null);
                                }}
                                disabled={!canAddToCart}
                            >
                                {selectedProduct.inStock
                                    ? canAddToCart
                                        ? t('menu.add_to_cart')
                                        : 'Välj ett alternativ'
                                    : t('menu.out_of_stock')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
