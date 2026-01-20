import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Container } from '../../components/common/Container/Container';
import { Button } from '../../components/common/Button/Button';
import { useLanguage } from '../../contexts/LanguageContext';
import { useCart } from '../../contexts/CartContext';
import { orderApi } from '../../services/api';
import type { OrderType, PaymentMethod } from '@shared/types';
import './Cart.css';

export const Cart: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { t } = useLanguage();
    const { items, updateQuantity, removeItem, getTotal, clearCart } = useCart();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Get order type from URL or default to 'takeaway'
    const orderType = (searchParams.get('type') as OrderType) || 'takeaway';

    // Get delivery info from localStorage if available
    const getDeliveryInfo = () => {
        const stored = localStorage.getItem('deliveryInfo');
        return stored ? JSON.parse(stored) : null;
    };

    const total = getTotal() / 100; // Convert from öre to kr

    const handleCheckout = async () => {
        if (items.length === 0) {
            setError('Din varukorg är tom');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            // Convert cart items to order items format
            const orderItems = items.map(item => ({
                productId: item.productId,
                productName: item.productName,
                quantity: item.quantity,
                price: item.price, // Already in öre
            }));

            // Get delivery info if order type is delivery
            const deliveryInfo = orderType === 'delivery' ? getDeliveryInfo() : undefined;

            // Create order
            const order = await orderApi.create({
                items: orderItems,
                orderType: orderType,
                deliveryInfo: deliveryInfo,
                paymentMethod: 'app' as PaymentMethod, // Default to app payment
            });

            // Clear cart
            clearCart();

            // Navigate to order status page with order ID
            navigate(`/status?orderId=${order.id}`);
        } catch (err: any) {
            setError(err.message || 'Kunde inte skapa beställning. Försök igen.');
            console.error('Error creating order:', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="cart-page animate-in">
            <Container className="cart-container">
                <h1 className="text-display-md cart-title">{t('cart.title')}</h1>

                {error && (
                    <div className="cart-error" style={{ 
                        padding: '1rem', 
                        background: '#fee', 
                        color: '#c00', 
                        borderRadius: '8px',
                        marginBottom: '1rem'
                    }}>
                        {error}
                    </div>
                )}

                {items.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-body-lg text-gray-500 mb-8">{t('cart.empty')}</p>
                        <Button variant="primary" onClick={() => navigate('/menu')}>
                            {t('nav.meny')}
                        </Button>
                    </div>
                ) : (
                    <div className="cart-content">
                        <div className="cart-items">
                            {items.map((item) => (
                                <div key={item.productId} className="cart-item">
                                    <div className="cart-item__info">
                                        <h3 className="text-heading-sm">{item.productName}</h3>
                                        <span className="cart-item__price">
                                            {(item.price / 100).toFixed(0)} kr
                                        </span>
                                    </div>
                                    <div className="cart-item__controls">
                                        <button 
                                            className="quantity-btn"
                                            onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                                        >
                                            -
                                        </button>
                                        <span className="quantity-value">{item.quantity}</span>
                                        <button 
                                            className="quantity-btn"
                                            onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                                        >
                                            +
                                        </button>
                                        <button 
                                            className="quantity-btn"
                                            onClick={() => removeItem(item.productId)}
                                            style={{ marginLeft: '0.5rem', color: '#c00' }}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="cart-summary">
                            <div className="cart-summary__row">
                                <span className="text-body-lg">{t('cart.total')}</span>
                                <span className="text-body-lg font-bold">{total.toFixed(0)} kr</span>
                            </div>
                            <hr className="cart-divider" />
                            <div className="cart-summary__row cart-summary__total">
                                <span className="text-heading-md">{t('cart.total')}</span>
                                <span className="text-heading-md font-bold text-primary">
                                    {total.toFixed(0)} kr
                                </span>
                            </div>

                            <Button
                                variant="primary"
                                fullWidth
                                size="lg"
                                className="checkout-btn"
                                onClick={handleCheckout}
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? 'Skapar beställning...' : t('cart.checkout')}
                            </Button>
                        </div>
                    </div>
                )}
            </Container>
        </div>
    );
};
