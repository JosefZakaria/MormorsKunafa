import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Container } from '../../components/common/Container/Container';
import { Button } from '../../components/common/Button/Button';
import { useLanguage } from '../../contexts/LanguageContext';
import { useCart } from '../../contexts/CartContext';
import { orderApi } from '../../services/api';
import type { CheckoutPaymentChoice, CustomerInfo, OrderType } from '@shared/types';
import { DELIVERY_FEE_SEK } from '@shared/constants/delivery';
import {
    dateToStockholmInputValue,
    todayInStockholmDateString,
} from '@shared/utils/scheduledTime';
import {
    clampScheduledClock,
    findNextOrderableSlot,
    getOrderableClockRange,
    validateScheduledOrderTime,
    isStoreClosedNow,
} from '@shared/utils/openingHours';
import './Cart.css';

/** Set to true when Swish checkout is ready for customers. */
const SWISH_CHECKOUT_ENABLED = false;

function roundClockToNext5Min(clock: string): string {
    const [hStr, mStr] = clock.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (isNaN(h) || isNaN(m)) return clock;

    const roundedM = Math.ceil(m / 5) * 5;
    if (roundedM >= 60) {
        const nextH = (h + 1) % 24;
        return `${String(nextH).padStart(2, '0')}:00`;
    }
    return `${String(h).padStart(2, '0')}:${String(roundedM).padStart(2, '0')}`;
}

export const Cart: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { t, language } = useLanguage();
    const scheduleLocale = language === 'ar' ? 'ar-SA' : language === 'en' ? 'en-GB' : 'sv-SE';
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
    const [paymentChoice, setPaymentChoice] = useState<CheckoutPaymentChoice>('card');

    const needsInlineCustomerInfo = orderType === 'eat-here' || orderType === 'takeaway';

    // --- Scheduled pickup/delivery date ---
    const todayStr = todayInStockholmDateString();
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    const maxDateStr = dateToStockholmInputValue(maxDate);

    const [prepTime, setPrepTime] = useState<number>(30);
    const [isClosedNow, setIsClosedNow] = useState(() => isStoreClosedNow());
    const [showClosedWarningPopup, setShowClosedWarningPopup] = useState(false);
    const [, setHasConfirmedClosedWarning] = useState(false);

    const initialSlot = findNextOrderableSlot(30);
    const [scheduledDate, setScheduledDate] = useState<string>(initialSlot.dateStr);
    const [scheduledClock, setScheduledClock] = useState(() => roundClockToNext5Min(initialSlot.clock));

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const timePickerRef = React.useRef<HTMLDivElement>(null);

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (timePickerRef.current && !timePickerRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);
    // Fetch public settings on mount
    useEffect(() => {
        orderApi.getPublicSettings()
            .then((settings) => {
                if (settings) {
                    const newPrepTime = settings.defaultPreparationTime;
                    setPrepTime(newPrepTime);
                    if (settings.isPaused) {
                        setShowPausedPopup(true);
                    }
                    
                    // Recalculate and set the initial slot with the correct prep time
                    const slot = findNextOrderableSlot(newPrepTime);
                    setScheduledDate(slot.dateStr);
                    setScheduledClock(roundClockToNext5Min(slot.clock));
                }
            })
            .catch((err) => {
                console.error('Failed to fetch public settings:', err);
            });
    }, []);

    // Keep store closed status updated
    useEffect(() => {
        const timer = setInterval(() => {
            setIsClosedNow(isStoreClosedNow());
        }, 15000);
        return () => clearInterval(timer);
    }, []);

    const clockRange = useMemo(
        () => getOrderableClockRange(scheduledDate, prepTime),
        [scheduledDate, prepTime]
    );

    const hoursToDisplay = useMemo(() => {
        if (!clockRange) return [];
        const minHour = parseInt(clockRange.min.split(':')[0], 10);
        const maxHour = parseInt(clockRange.max.split(':')[0], 10);
        const start = Math.max(0, minHour - 3);
        const end = Math.min(23, maxHour + 1);
        const arr = [];
        for (let i = start; i <= end; i++) {
            arr.push(i);
        }
        return arr;
    }, [clockRange]);

    const minutesToDisplay = useMemo(() => [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55], []);

    const hoursContainerRef = React.useRef<HTMLDivElement>(null);
    const minutesContainerRef = React.useRef<HTMLDivElement>(null);

    const isHourDisabled = (hour: number): boolean => {
        if (!clockRange) return true;
        const minHour = parseInt(clockRange.min.split(':')[0], 10);
        const maxHour = parseInt(clockRange.max.split(':')[0], 10);
        return hour < minHour || hour > maxHour;
    };

    const isMinuteDisabled = (minute: number, currentHour: number): boolean => {
        if (!clockRange) return true;
        const minTotal = parseInt(clockRange.min.split(':')[0], 10) * 60 + parseInt(clockRange.min.split(':')[1], 10);
        const maxTotal = parseInt(clockRange.max.split(':')[0], 10) * 60 + parseInt(clockRange.max.split(':')[1], 10);
        const currentTotal = currentHour * 60 + minute;
        return currentTotal < minTotal || currentTotal > maxTotal;
    };

    const selectHour = (hourVal: number) => {
        if (isHourDisabled(hourVal)) return;
        const currentMinStr = scheduledClock.split(':')[1];
        const newClockCandidate = `${String(hourVal).padStart(2, '0')}:${currentMinStr}`;
        const clamped = clampScheduledClock(scheduledDate, newClockCandidate, prepTime);
        setScheduledClock(roundClockToNext5Min(clamped));
    };

    const selectMinute = (minuteVal: number) => {
        const hourStr = scheduledClock.split(':')[0];
        const hourVal = parseInt(hourStr, 10);
        if (isMinuteDisabled(minuteVal, hourVal)) return;
        const newClockCandidate = `${hourStr}:${String(minuteVal).padStart(2, '0')}`;
        const clamped = clampScheduledClock(scheduledDate, newClockCandidate, prepTime);
        setScheduledClock(roundClockToNext5Min(clamped));
    };

    useEffect(() => {
        if (isDropdownOpen) {
            const hoursCol = hoursContainerRef.current;
            if (hoursCol) {
                const activeHourEl = hoursCol.querySelector('.cart-schedule__time-item--active');
                if (activeHourEl) {
                    activeHourEl.scrollIntoView({ block: 'nearest', behavior: 'auto' });
                }
            }
            const minutesCol = minutesContainerRef.current;
            if (minutesCol) {
                const activeMinuteEl = minutesCol.querySelector('.cart-schedule__time-item--active');
                if (activeMinuteEl) {
                    activeMinuteEl.scrollIntoView({ block: 'nearest', behavior: 'auto' });
                }
            }
        }
    }, [isDropdownOpen, scheduledClock]);

    const handleScheduledDateChange = (value: string) => {
        const next = value || todayStr;
        setScheduledDate(next);
        const range = getOrderableClockRange(next, prepTime);
        if (range) {
            setScheduledClock((prev) => roundClockToNext5Min(clampScheduledClock(next, prev, prepTime)));
        } else {
            const slot = findNextOrderableSlot(prepTime);
            setScheduledDate(slot.dateStr);
            setScheduledClock(roundClockToNext5Min(slot.clock));
        }
    };

    const resolveScheduledClock = (): string => {
        const clock = roundClockToNext5Min(clampScheduledClock(scheduledDate, scheduledClock, prepTime));
        if (clock !== scheduledClock) {
            setScheduledClock(clock);
        }
        return clock;
    };

    const formatScheduleSummary = (): string => {
        const hm = scheduledClock.slice(0, 5);
        if (scheduledDate === todayStr) {
            return t('cart.schedule_today_at').replace('{time}', hm);
        }
        const [yy, mo, dd] = scheduledDate.split('-').map(Number);
        const label = new Date(yy, mo - 1, dd).toLocaleDateString(scheduleLocale, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
        });
        return `${t('cart.schedule_future')} ${label} ${hm}`;
    };

    const formatClosedDateTime = (): string => {
        const hm = scheduledClock.slice(0, 5);
        if (scheduledDate === todayStr) {
            return t('cart.schedule_today_at').replace('{time}', hm).toLowerCase();
        }
        const [yy, mo, dd] = scheduledDate.split('-').map(Number);
        const label = new Date(yy, mo - 1, dd).toLocaleDateString(scheduleLocale, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
        });
        if (language === 'ar') {
            return `${label} الساعة ${hm}`;
        }
        if (language === 'en') {
            return `${label} at ${hm}`;
        }
        return `${label} kl. ${hm}`;
    };

    // Get delivery info from localStorage if available
    const getDeliveryInfo = () => {
        const stored = localStorage.getItem('deliveryInfo');
        return stored ? JSON.parse(stored) : null;
    };

    const subtotalKr = getTotal() / 100;
    const isDeliveryOrder = orderType === 'delivery';
    const deliveryFeeKr = isDeliveryOrder ? DELIVERY_FEE_SEK : 0;
    const totalKr = subtotalKr + deliveryFeeKr;

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

    const handleConfirmClosedWarning = () => {
        setHasConfirmedClosedWarning(true);
        setShowClosedWarningPopup(false);
        void handleCheckout(true);
    };

    const handleCheckout = async (bypassClosedCheck = false) => {
        if (items.length === 0) {
            setError('Din varukorg är tom');
            return;
        }
        if (!orderType) {
            setOrderTypeError('Välj hur du vill få din beställning.');
            return;
        }

        if (isClosedNow && !bypassClosedCheck) {
            setShowClosedWarningPopup(true);
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

            // For delivery, derive customer info from the delivery form data.
            if (orderType === 'delivery') {
                if (!deliveryInfo) {
                    setError('Leveransinformationen saknas. Fyll i uppgifterna igen.');
                    return;
                }

                const name = (deliveryInfo.name || '').trim();
                const phone = (deliveryInfo.phone || '').trim();
                const email = (deliveryInfo.email || '').trim();

                if (!name || !phone) {
                    setError(t('cart.customer_info_required'));
                    return;
                }

                customerInfo = {
                    name,
                    phone,
                    ...(email ? { email } : {}),
                };
            }

            if (!customerInfo) {
                setError(t('cart.customer_info_required'));
                return;
            }

            const clock = resolveScheduledClock();
            const scheduledTime = scheduledDate
                ? `${scheduledDate}T${clock}:00`
                : undefined;

            const hoursCheck = validateScheduledOrderTime(scheduledTime);
            if (!hoursCheck.valid) {
                setError(hoursCheck.error);
                setIsSubmitting(false);
                return;
            }

            if (paymentChoice === 'swish') {
                const phoneForSwish =
                    customerInfo?.phone?.trim() ||
                    (deliveryInfo?.phone as string | undefined)?.trim() ||
                    '';
                if (!phoneForSwish) {
                    setError('Ange telefonnummer för Swish-betalning.');
                    setIsSubmitting(false);
                    return;
                }
                sessionStorage.setItem('swishPayerPhone', phoneForSwish);
            }

            const order = await orderApi.create({
                items: orderItems,
                orderType: orderType as OrderType,
                customerInfo,
                deliveryInfo: deliveryInfo,
                scheduledTime,
                paymentMethod: paymentChoice,
            });

            clearCart();

            if (paymentChoice === 'card') {
                const { url } = await orderApi.createCheckoutSession(order.id);
                window.location.href = url;
            } else {
                navigate(`/pay/swish?orderId=${encodeURIComponent(order.id)}`);
            }
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
                {items.length > 0 && (
                    <h1 className="text-display-md cart-title">{t('cart.title')}</h1>
                )}

                {isClosedNow && items.length > 0 && (
                    <div className="cart-closed-banner animate-in" style={{
                        padding: '1.25rem',
                        background: '#fff9e6',
                        color: '#856404',
                        border: '1px solid #ffeeba',
                        borderRadius: '12px',
                        marginBottom: '1.5rem',
                        display: 'flex',
                        gap: '0.85rem',
                        alignItems: 'flex-start',
                        boxShadow: '0 2px 8px rgba(133,100,4,0.05)'
                    }}>
                        <span className="cart-closed-banner__icon" style={{ fontSize: '1.5rem', lineHeight: '1' }}>⚠️</span>
                        <div className="cart-closed-banner__content">
                            <strong className="cart-closed-banner__title" style={{ display: 'block', marginBottom: '0.35rem', fontSize: '1.05rem', fontFamily: 'var(--font-family-display)' }}>
                                {t('cart.closed_warning_title')}
                            </strong>
                            <p className="cart-closed-banner__text" style={{ margin: 0, fontSize: '0.95rem', lineHeight: '1.45' }}>
                                {t('cart.closed_warning_banner_message').replace('{datetime}', formatClosedDateTime())}
                            </p>
                        </div>
                    </div>
                )}

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
                    <div className="cart-empty">
                        <p className="cart-empty__text">{t('cart.empty')}</p>
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
                                            <span className="customer-info__required" aria-hidden="true">*</span>
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
                                            <span className="customer-info__required" aria-hidden="true">*</span>
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

                            {isDeliveryOrder ? (
                                <>
                                    <div className="cart-summary__row">
                                        <span className="text-body-lg">{t('cart.subtotal')}</span>
                                        <span className="text-body-lg">{subtotalKr.toFixed(0)} kr</span>
                                    </div>
                                    <div className="cart-summary__row">
                                        <span className="text-body-lg">{t('cart.delivery_fee')}</span>
                                        <span className="text-body-lg">{deliveryFeeKr.toFixed(0)} kr</span>
                                    </div>
                                    <hr className="cart-divider" />
                                </>
                            ) : null}
                            <div className="cart-summary__row cart-summary__total">
                                <span className="text-heading-md">{t('cart.total')}</span>
                                <span className="text-heading-md font-bold text-primary">
                                    {totalKr.toFixed(0)} kr
                                </span>
                            </div>

                            <div className="payment-method-selector">
                                <span className="order-type-label">Betalning</span>
                                <label className="payment-method-option">
                                    <input
                                        type="radio"
                                        name="payment"
                                        value="card"
                                        checked={paymentChoice === 'card'}
                                        onChange={() => setPaymentChoice('card')}
                                    />
                                    Kortbetalning
                                </label>
                                {SWISH_CHECKOUT_ENABLED && (
                                    <label className="payment-method-option">
                                        <input
                                            type="radio"
                                            name="payment"
                                            value="swish"
                                            checked={paymentChoice === 'swish'}
                                            onChange={() => setPaymentChoice('swish')}
                                        />
                                        Swish
                                    </label>
                                )}
                            </div>

                            <Button
                                variant="primary"
                                fullWidth
                                size="lg"
                                className="checkout-btn"
                                onClick={() => handleCheckout()}
                                disabled={isSubmitting || !clockRange}
                            >
                                {isSubmitting ? 'Skapar beställning...' : t('cart.checkout')}
                            </Button>
                        </div>

                        <div className="cart-schedule">
                            <h3 className="cart-schedule__title">{t('cart.schedule_title')}</h3>
                            <label htmlFor="cart-schedule-date" className="cart-schedule__label">
                                {t('cart.schedule_label')}
                            </label>
                            <input
                                id="cart-schedule-date"
                                type="date"
                                className="cart-schedule__input"
                                value={scheduledDate}
                                min={todayStr}
                                max={maxDateStr}
                                onChange={(e) => handleScheduledDateChange(e.target.value)}
                            />
                            <label className="cart-schedule__label cart-schedule__label--time">
                                {t('cart.schedule_time_label')}
                            </label>
                            <div 
                                className={`cart-schedule__time-picker ${!clockRange ? 'cart-schedule__time-picker--disabled' : ''}`}
                                ref={timePickerRef}
                            >
                                <button
                                    type="button"
                                    className={`cart-schedule__time-trigger ${isDropdownOpen ? 'cart-schedule__time-trigger--open' : ''}`}
                                    disabled={!clockRange}
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                >
                                    <span className="cart-schedule__time-value">{scheduledClock}</span>
                                    <svg className="cart-schedule__time-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <polyline points="12 6 12 12 16 14"></polyline>
                                    </svg>
                                </button>
                                
                                {isDropdownOpen && clockRange && (
                                    <div className="cart-schedule__time-dropdown">
                                        <div className="cart-schedule__time-column-wrapper">
                                            <div className="cart-schedule__time-column-header">TIMME</div>
                                            <div className="cart-schedule__time-column" ref={hoursContainerRef}>
                                                {hoursToDisplay.map((hour) => {
                                                    const hourStr = String(hour).padStart(2, '0');
                                                    const isSelected = scheduledClock.startsWith(hourStr);
                                                    const disabled = isHourDisabled(hour);
                                                    return (
                                                        <button
                                                            key={hour}
                                                            type="button"
                                                            className={`cart-schedule__time-item ${isSelected ? 'cart-schedule__time-item--active' : ''} ${disabled ? 'cart-schedule__time-item--disabled' : ''}`}
                                                            disabled={disabled}
                                                            onClick={() => selectHour(hour)}
                                                        >
                                                            {hourStr}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div className="cart-schedule__time-divider"></div>
                                        <div className="cart-schedule__time-column-wrapper">
                                            <div className="cart-schedule__time-column-header">MINUT</div>
                                            <div className="cart-schedule__time-column" ref={minutesContainerRef}>
                                                {minutesToDisplay.map((minute) => {
                                                    const minuteStr = String(minute).padStart(2, '0');
                                                    const isSelected = scheduledClock.endsWith(minuteStr);
                                                    const currentHour = parseInt(scheduledClock.split(':')[0], 10);
                                                    const disabled = isMinuteDisabled(minute, currentHour);
                                                    return (
                                                        <button
                                                            key={minute}
                                                            type="button"
                                                            className={`cart-schedule__time-item ${isSelected ? 'cart-schedule__time-item--active' : ''} ${disabled ? 'cart-schedule__time-item--disabled' : ''}`}
                                                            disabled={disabled}
                                                            onClick={() => selectMinute(minute)}
                                                        >
                                                            {minuteStr}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            {!clockRange && (
                                <p className="cart-schedule__notice">{t('cart.schedule_closed_day')}</p>
                            )}
                            <p className="cart-schedule__summary">
                                {formatScheduleSummary()}
                            </p>
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

            {showClosedWarningPopup && (
                <div className="cart-popup-overlay animate-in">
                    <div className="cart-popup-content" style={{ maxWidth: '480px' }}>
                        <div className="cart-popup-icon">ℹ️</div>
                        <h3 className="text-heading-md" style={{ marginBottom: '1rem' }}>
                            {t('cart.closed_warning_title')}
                        </h3>
                        <p className="text-body-lg" style={{ marginBottom: '2rem', lineHeight: '1.5' }}>
                            {t('cart.closed_warning_popup_message')
                                .replace('{datetime}', formatClosedDateTime())
                                .replace('{prep}', String(prepTime))}
                        </p>
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }} className="cart-popup-buttons">
                            <Button 
                                variant="secondary" 
                                onClick={() => setShowClosedWarningPopup(false)} 
                                fullWidth
                            >
                                {t('cart.closed_warning_cancel')}
                            </Button>
                            <Button 
                                variant="primary" 
                                onClick={() => handleConfirmClosedWarning()} 
                                fullWidth
                            >
                                {t('cart.closed_warning_confirm').replace('{datetime}', formatClosedDateTime())}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
