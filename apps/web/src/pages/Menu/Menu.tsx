import React, { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { Container } from '../../components/common/Container/Container';
import { Card } from '../../components/common/Card/Card';
import { Button } from '../../components/common/Button/Button';
import { useLanguage } from '../../contexts/LanguageContext';
import { useCart } from '../../contexts/CartContext';
import { useToast } from '../../contexts/ToastContext';
import { productApi } from '../../services/api';
import type { Product } from '@shared/types';
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

function sanitizeHtml(html: string): string {
    return DOMPurify.sanitize(html, { ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'h3', 'ul', 'li', 'span'] });
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
    const { t } = useLanguage();
    const { addItem } = useCart();
    const { showToast } = useToast();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [usingMockData, setUsingMockData] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const tRef = useRef(t);
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
                    setProducts(data);
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

    const handleAddToCart = (product: Product) => {
        if (!product.inStock) {
            alert('Denna produkt är tyvärr slut i lager.');
            return;
        }
        addItem(product, 1);
        showToast(`${product.name} har lagts till i varukorgen!`, 'success');
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
                    <header className="menu-page__header">
                        <h1 className="text-display-md text-center">{t('menu.title')}</h1>
                        <p className="text-center text-body-lg menu-page__subtitle">
                            {t('menu.subtitle')}
                        </p>
                        {usingMockData && (
                            <p className="text-center text-body-sm" style={{ color: '#666', marginTop: '0.5rem' }}>
                                (Demo-läge: Använder testdata)
                            </p>
                        )}
                    </header>

                    <div className="menu-grid">
                        {products.map((product) => (
                            <Card 
                                key={product.id} 
                                className={`menu-item ${!product.inStock ? 'menu-item--out-of-stock' : ''}`}
                            >
                                <div
                                    className="menu-item__clickable"
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
                                    <div className="menu-item__image-container">
                                        <img src={product.image} alt={product.name} className="menu-item__image" />
                                        {!product.inStock && (
                                            <div className="menu-item__out-of-stock-badge">
                                                Slut i lager
                                            </div>
                                        )}
                                    </div>
                                    <div className="menu-item__content">
                                        <div className="menu-item__info">
                                            <h3 className="text-heading-sm">{product.name}</h3>
                                            <span className="menu-item__price">
                                                {(product.price / 100).toFixed(0)} kr
                                            </span>
                                        </div>
                                        <p className="menu-item__description text-body-sm">
                                            {stripHtmlAndTruncate(product.description, SHORT_DESC_LENGTH)}
                                        </p>
                                    </div>
                                </div>
                                <div className="menu-item__actions">
                                    <Button 
                                        variant="primary" 
                                        fullWidth 
                                        size="sm" 
                                        className="menu-item__btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleAddToCart(product);
                                        }}
                                        disabled={!product.inStock}
                                    >
                                        {product.inStock ? t('menu.add_to_cart') : 'Slut i lager'}
                                    </Button>
                                </div>
                            </Card>
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
                        className="menu-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            className="menu-modal__close"
                            onClick={() => setSelectedProduct(null)}
                            aria-label="Stäng"
                        >
                            ×
                        </button>
                        <div className="menu-modal__image-wrap">
                            <img
                                src={selectedProduct.image}
                                alt={selectedProduct.name}
                                className="menu-modal__image"
                            />
                        </div>
                        <div className="menu-modal__body">
                            <h2 id="menu-modal-title" className="text-heading-md menu-modal__title">
                                {selectedProduct.name}
                            </h2>
                            <p className="menu-modal__price">
                                {(selectedProduct.price / 100).toFixed(0)} kr
                            </p>
                            <div
                                className="menu-modal__description text-body-sm"
                                dangerouslySetInnerHTML={{
                                    __html: sanitizeHtml(selectedProduct.description || ''),
                                }}
                            />
                            <Button
                                variant="primary"
                                fullWidth
                                className="menu-modal__btn"
                                onClick={() => {
                                    handleAddToCart(selectedProduct);
                                    setSelectedProduct(null);
                                }}
                                disabled={!selectedProduct.inStock}
                            >
                                {selectedProduct.inStock ? t('menu.add_to_cart') : 'Slut i lager'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
