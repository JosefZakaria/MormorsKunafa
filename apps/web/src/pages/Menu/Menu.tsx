import React from 'react';
import { Container } from '../../components/common/Container/Container';
import { Card } from '../../components/common/Card/Card';
import { Button } from '../../components/common/Button/Button';
import './Menu.css';

interface Product {
    id: string;
    name: string;
    price: string;
    description: string;
    image: string;
}



import { useLanguage } from '../../contexts/LanguageContext';

export const Menu: React.FC = () => {
    const { t } = useLanguage();

    const products = [
        {
            id: '1',
            name: t('products.1.name'),
            price: '129 kr',
            description: t('products.1.desc'),
            image: '/images/pistage-baklawa.jpg'
        },
        {
            id: '2',
            name: t('products.2.name'),
            price: '129 kr',
            description: t('products.2.desc'),
            image: '/images/walnut-baklawa.jpg'
        },
        {
            id: '3',
            name: t('products.3.name'),
            price: '119 kr',
            description: t('products.3.desc'),
            image: '/images/finmald-kunafa.jpg'
        },
        {
            id: '4',
            name: t('products.4.name'),
            price: '85 kr',
            description: t('products.4.desc'),
            image: '/images/kaake-kunafa.jpg'
        },
        {
            id: '5',
            name: t('products.5.name'),
            price: '119 kr',
            description: t('products.5.desc'),
            image: '/images/kunafa-ashta.jpg'
        },
        {
            id: '6',
            name: t('products.6.name'),
            price: '139 kr',
            description: t('products.6.desc'),
            image: '/images/harise-ashta.jpg'
        },
        {
            id: '7',
            name: t('products.7.name'),
            price: '149 kr',
            description: t('products.7.desc'),
            image: '/images/ostkaka.jpg'
        },
        {
            id: '8',
            name: t('products.8.name'),
            price: '119 kr',
            description: t('products.8.desc'),
            image: '/images/krispig-kunafa.jpg'
        }
    ];

    return (
        <div className="menu-page animate-in">
            <Container>
                <header className="menu-page__header">
                    <h1 className="text-display-md text-center">{t('menu.title')}</h1>
                    <p className="text-center text-body-lg menu-page__subtitle">
                        {t('menu.subtitle')}
                    </p>
                </header>

                <div className="menu-grid">
                    {products.map((product) => (
                        <Card key={product.id} className="menu-item" onClick={() => console.log('View product', product.id)}>
                            <div className="menu-item__image-container">
                                <img src={product.image} alt={product.name} className="menu-item__image" />
                            </div>
                            <div className="menu-item__content">
                                <div className="menu-item__info">
                                    <h3 className="text-heading-sm">{product.name}</h3>
                                    <span className="menu-item__price">{product.price}</span>
                                </div>
                                <p className="menu-item__description text-body-sm">{product.description}</p>
                                <Button variant="primary" fullWidth size="sm" className="menu-item__btn">
                                    {t('menu.add_to_cart')}
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            </Container>
        </div>
    );
};
