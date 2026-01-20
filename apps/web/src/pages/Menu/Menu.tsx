import React, { useEffect, useState } from 'react';
import { Container } from '../../components/common/Container/Container';
import { Card } from '../../components/common/Card/Card';
import { Button } from '../../components/common/Button/Button';
import { useLanguage } from '../../contexts/LanguageContext';
import { useCart } from '../../contexts/CartContext';
import { useToast } from '../../contexts/ToastContext';
import { productApi } from '../../services/api';
import type { Product } from '@shared/types';
import './Menu.css';

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

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                setLoading(true);
                setError(null);
                setUsingMockData(false);
                const data = await productApi.getAll();
                setProducts(data);
            } catch (err) {
                // Fallback to mock data if API fails
                console.warn('API not available, using mock data:', err);
                setUsingMockData(true);
                setProducts(getMockProducts(t));
            } finally {
                setLoading(false);
            }
        };

        fetchProducts();
    }, [t]);

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
                                <p className="menu-item__description text-body-sm">{product.description}</p>
                                <Button 
                                    variant="primary" 
                                    fullWidth 
                                    size="sm" 
                                    className="menu-item__btn"
                                    onClick={() => handleAddToCart(product)}
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
    );
};
