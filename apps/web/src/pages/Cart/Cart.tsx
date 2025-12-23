import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Container } from '../../components/common/Container/Container';
import { Button } from '../../components/common/Button/Button';
import './Cart.css';

import { useLanguage } from '../../contexts/LanguageContext';
import { useState } from 'react';

interface CartItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
}

export const Cart: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useLanguage();
    const [cartItems, setCartItems] = useState<CartItem[]>([]);

    const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

    return (
        <div className="cart-page animate-in">
            <Container className="cart-container">
                <h1 className="text-display-md cart-title">{t('cart.title')}</h1>

                {cartItems.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-body-lg text-gray-500 mb-8">{t('cart.empty')}</p>
                        <Button variant="primary" onClick={() => navigate('/menu')}>
                            {t('nav.meny')}
                        </Button>
                    </div>
                ) : (
                    <div className="cart-content">
                        <div className="cart-items">
                            {cartItems.map((item) => (
                                <div key={item.id} className="cart-item">
                                    <div className="cart-item__info">
                                        <h3 className="text-heading-sm">{item.name}</h3>
                                        <span className="cart-item__price">{item.price} kr</span>
                                    </div>
                                    <div className="cart-item__controls">
                                        <button className="quantity-btn">-</button>
                                        <span className="quantity-value">{item.quantity}</span>
                                        <button className="quantity-btn">+</button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="cart-summary">
                            <div className="cart-summary__row">
                                <span className="text-body-lg">{t('cart.total')}</span>
                                <span className="text-body-lg font-bold">{total} kr</span>
                            </div>
                            <hr className="cart-divider" />
                            <div className="cart-summary__row cart-summary__total">
                                <span className="text-heading-md">{t('cart.total')}</span>
                                <span className="text-heading-md font-bold text-primary">{total} kr</span>
                            </div>

                            <Button
                                variant="primary"
                                fullWidth
                                size="lg"
                                className="checkout-btn"
                                onClick={() => navigate('/status')}
                            >
                                {t('cart.checkout')}
                            </Button>
                        </div>
                    </div>
                )}
            </Container>
        </div>
    );
};
