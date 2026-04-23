import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Container } from '../../components/common/Container/Container';
import { Button } from '../../components/common/Button/Button';
import { useLanguage } from '../../contexts/LanguageContext';
import { useCart } from '../../contexts/CartContext';
import { orderApi } from '../../services/api';
import type { CustomerInfo, OrderType, PaymentMethod } from '@shared/types';
import './Cart.css';

export const Cart: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { t } = useLanguage();
    const { items, updateQuantity, removeItem, getTotal, clearCart } = useCart();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPausedPopup, setShowPausedPopup] = useState(false);
    const [orderType, setOrderType] = useState<OrderType | ''>(() => {
        const fromUrl = searchParams.get('type') as OrderType;
        if (fromUrl) return fromUrl;
        const stored = sessionStorage.getItem('orderType') as OrderType;
        return stored || '';
    });
    const [orderTypeError, setOrderTypeError] = useState<string | null>(null);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [customerInfoError, setCustomerInfoError] = useState<string | null>(null);

    const needsInlineCustomerInfo = orderType === 'eat-here' || orderType === 'takeaway';

    // Get delivery info from localStorage if available
    const getDeliveryInfo = () => {
        const stored = localStorage.getItem('deliveryInfo');
        return stored ? JSON.parse(stored) : null;
    };

    const total = getTotal() / 100; // Convert from öre to kr

    const handleOrderTypeChange = (value: string) => {
        setOrderTypeError(null);
        if (value === 'delivery') {
            localStorage.setItem('cartReturnTo', 'true');
            navigate('/delivery');
            return;
        }
        sessionStorage.setItem('orderType', value);
        setOrderType(value as OrderType);
    };

    const handleCheckout = async () => {
        if (items.length === 0) {
            setError('Din varukorg är tom');
            return;
        }
        if (!orderType) {
            setOrderTypeError('Välj hur du vill få din beställning.');
            return;
        }

        let customerInfo: CustomerInfo | undefined;
        if (needsInlineCustomerInfo) {
            const name = customerName.trim();
            const phone = customerPhone.trim();
            if (!name || !phone) {
                setCustomerInfoError(t('cart.customer_info_required'));
                return;
            }
            const email = customerEmail.trim();
            customerInfo = { name, phone, ...(email ? { email } : {}) };
        }

        setIsSubmitting(true);
        setError(null);
        setOrderTypeError(null);
        setCustomerInfoError(null);

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

            // For delivery, derive customer info from the delivery form data
            if (orderType === 'delivery' && deliveryInfo) {
                const name = (deliveryInfo.name || '').trim();
                const phone = (deliveryInfo.phone || '').trim();
                const email = (deliveryInfo.email || '').trim();
                if (name || phone || email) {
                    customerInfo = {
                        name,
                        phone,
                        ...(email ? { email } : {}),
                    };
                }
            }

            // Create order
            const order = await orderApi.create({
                items: orderItems,
                orderType: orderType as OrderType,
                customerInfo,
                deliveryInfo: deliveryInfo,
                paymentMethod: 'app' as PaymentMethod, // Default to app payment
            });

            // Clear cart
            clearCart();

            // Navigate to order status page with order ID
            navigate(`/status?orderId=${order.id}`);
        } catch (err: any) {
            let errorMsg = err.message || 'Kunde inte skapa beställning. Försök igen.';
            if (err.data && err.data.error) {
                errorMsg = err.data.error;
            }
            if (errorMsg.toLowerCase().includes('pausade') || err.status === 403) {
                setShowPausedPopup(true);
            } else {
                setError(errorMsg);
            }
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
                            <div className="order-type-selector">
                                <label className="order-type-label">Leveranssätt</label>
                                <select
                                    className={`order-type-select ${orderTypeError ? 'order-type-select--error' : ''}`}
                                    value={orderType}
                                    onChange={(e) => handleOrderTypeChange(e.target.value)}
                                >
                                    <option value="" disabled>Välj leveranssätt...</option>
                                    <option value="eat-here">Äta här</option>
                                    <option value="takeaway">Ta med</option>
                                    <option value="delivery">Hemkörning</option>
                                </select>
                                {orderTypeError && (
                                    <p className="order-type-error">{orderTypeError}</p>
                                )}
                            </div>

                            {needsInlineCustomerInfo && (
                                <div className="customer-info">
                                    <h3 className="customer-info__title">{t('cart.customer_info_title')}</h3>
                                    <div className="customer-info__field">
                                        <label htmlFor="customer-name" className="customer-info__label">
                                            {t('cart.customer_name')}
                                        </label>
                                        <input
                                            id="customer-name"
                                            type="text"
                                            className="customer-info__input"
                                            placeholder={t('cart.customer_name_placeholder')}
                                            value={customerName}
                                            onChange={(e) => setCustomerName(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="customer-info__field">
                                        <label htmlFor="customer-phone" className="customer-info__label">
                                            {t('cart.customer_phone')}
                                        </label>
                                        <input
                                            id="customer-phone"
                                            type="tel"
                                            className="customer-info__input"
                                            placeholder={t('cart.customer_phone_placeholder')}
                                            value={customerPhone}
                                            onChange={(e) => setCustomerPhone(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="customer-info__field">
                                        <label htmlFor="customer-email" className="customer-info__label">
                                            {t('cart.customer_email')}
                                        </label>
                                        <input
                                            id="customer-email"
                                            type="email"
                                            className="customer-info__input"
                                            placeholder={t('cart.customer_email_placeholder')}
                                            value={customerEmail}
                                            onChange={(e) => setCustomerEmail(e.target.value)}
                                        />
                                    </div>
                                    {customerInfoError && (
                                        <p className="order-type-error">{customerInfoError}</p>
                                    )}
                                </div>
                            )}

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

            {showPausedPopup && (
                <div className="cart-popup-overlay animate-in">
                    <div className="cart-popup-content">
                        <div className="cart-popup-icon">⚠️</div>
                        <h3 className="text-heading-md" style={{ marginBottom: '1rem' }}>Pausat</h3>
                        <p className="text-body-lg" style={{ marginBottom: '2rem' }}>
                            Beställningar är för tillfället pausade. Vänligen försök igen lite senare!
                        </p>
                        <Button variant="primary" onClick={() => setShowPausedPopup(false)} fullWidth>
                            Okej, jag förstår
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};
