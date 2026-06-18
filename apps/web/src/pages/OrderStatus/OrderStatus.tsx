import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Container } from '../../components/common/Container/Container';
import { orderApi } from '../../services/api';
import type { Order } from '@shared/types';
import { isAwaitingOnlinePayment } from '../../utils/payment';
import { parseApiTimestamp } from '@shared/utils/parseApiTimestamp';
import './OrderStatus.css';

function getCountdown(isoTime: string | undefined): string {
    if (!isoTime) return '--:--';
    const target = parseApiTimestamp(isoTime);
    if (!target) return '--:--';
    const diff = target.getTime() - Date.now();
    const isOverdue = diff < 0;
    const absoluteDiff = Math.abs(diff);
    const mins = Math.floor(absoluteDiff / 60000);
    const secs = Math.floor((absoluteDiff % 60000) / 1000);
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return isOverdue ? `-${formatted}` : formatted;
}

function todayInStockholm(): string {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
}

function formatScheduledDate(iso: string | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const datePart = d.toLocaleDateString('sv-SE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'Europe/Stockholm',
    });
    return datePart.charAt(0).toUpperCase() + datePart.slice(1);
}

function formatScheduledClock(iso: string | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('sv-SE', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Europe/Stockholm',
    });
}

function isFutureScheduled(scheduledTime?: string): boolean {
    if (!scheduledTime) return false;
    const schedDate = new Date(scheduledTime).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
    return schedDate > todayInStockholm();
}

/** Live timer + steg — endast äta här / ta med samma dag. */
function usesLivePickupTracking(order: Order): boolean {
    if (order.orderType === 'delivery') return false;
    if (isFutureScheduled(order.scheduledTime)) return false;
    return order.orderType === 'eat-here' || order.orderType === 'takeaway';
}

const STATUS_STEPS: Order['status'][] = ['ny', 'påbörjad', 'klar'];

const STEP_LABELS: Record<string, string> = {
    ny: 'Skickad',
    påbörjad: 'Förbereder',
    klar: 'Klar',
};

function BackToMenuButton({ onClick }: { onClick: () => void }) {
    return (
        <button type="button" className="status-back-btn" onClick={onClick}>
            Tillbaka till menyn
        </button>
    );
}

function OrderItemsSummary({ order }: { order: Order }) {
    if (!order.items?.length) return null;
    return (
        <div className="status-order-summary">
            <p className="status-order-summary__title">Din beställning</p>
            <ul>
                {order.items.map((item, i) => (
                    <li key={i}>
                        {item.quantity}× {item.productName}
                        {' — '}
                        {((item.price * item.quantity) / 100).toFixed(0)} kr
                    </li>
                ))}
            </ul>
            <p className="status-order-summary__total">
                Totalt {(order.totalPrice / 100).toFixed(0)} kr
            </p>
        </div>
    );
}

function DeliveryAddressPanel({ order }: { order: Order }) {
    const d = order.deliveryInfo;
    const name = order.customerInfo?.name?.trim() || d?.name?.trim() || '';
    const phone = order.customerInfo?.phone?.trim() || d?.phone?.trim() || '';
    const postalCity = d ? [d.postalCode, d.city].filter(Boolean).join(' ').trim() : '';
    if (!name && !d?.address && !postalCity && !phone) return null;

    return (
        <div className="status-info-panel">
            <p className="status-info-panel__title">Leverans till</p>
            {name && <p><strong>{name}</strong></p>}
            {d?.address && <p>{d.address}</p>}
            {postalCity && <p>{postalCity}</p>}
            {phone && <p>Tel: {phone}</p>}
        </div>
    );
}

function SimpleConfirmationView({
    order,
    isAwaitingPayment,
    onBack,
}: {
    order: Order;
    isAwaitingPayment: boolean;
    onBack: () => void;
}) {
    const isDelivery = order.orderType === 'delivery';
    const isBooked = isFutureScheduled(order.scheduledTime);
    const isDelivered = order.status === 'levererad';
    const isKitchenDone = order.status === 'klar' && isDelivery;

    const scheduledLabel = order.scheduledTime
        ? `${formatScheduledDate(order.scheduledTime)}${formatScheduledClock(order.scheduledTime) ? ` kl. ${formatScheduledClock(order.scheduledTime)}` : ''}`
        : null;

    let title = 'Tack för din beställning!';
    if (isAwaitingPayment) title = 'Bekräftar din betalning…';
    else if (isBooked) title = 'Din beställning är bokad';
    else if (isDelivered) title = 'Din beställning har levererats';
    else if (isKitchenDone) title = 'Din order är färdigställd';

    let message: string;
    if (isAwaitingPayment) {
        message = 'Vi bekräftar din betalning. Sidan uppdateras automatiskt om några sekunder.';
    } else if (isDelivered) {
        message = 'Tack! Vi hoppas att du njöt av din Kunafa.';
    } else if (isKitchenDone) {
        message = 'Vi har lagat din beställning och förbereder leveransen till dig.';
    } else if (isDelivery) {
        message = scheduledLabel
            ? `Vi har tagit emot din beställning. Leverans är planerad till ${scheduledLabel}. Du får bekräftelse via e-post om du angav adress.`
            : 'Vi har tagit emot din beställning. Hemleverans sker normalt inom 1–2 arbetsdagar över hela Sverige. Du får bekräftelse via e-post om du angav adress.';
    } else if (isBooked && scheduledLabel) {
        message = `Vi förbereder din order närmare ${scheduledLabel}. Du behöver inte följa minut-timer här — vid frågor, kontakta oss med ditt ordernummer.`;
    } else {
        message = 'Vi har tagit emot din beställning och återkommer vid behov.';
    }

    return (
        <>
            <h1 className="text-display-md status-title">{title}</h1>
            <p className="text-center status-message">{message}</p>

            {isDelivery && !isAwaitingPayment && (
                <p className="status-hint">
                    {scheduledLabel
                        ? `Planerad: ${scheduledLabel}`
                        : 'Beräknad leverans: 1–2 arbetsdagar'}
                </p>
            )}

            {isBooked && scheduledLabel && !isDelivery && (
                <p className="status-hint">Upphämtning: {scheduledLabel}</p>
            )}

            {isDelivery && <DeliveryAddressPanel order={order} />}
            <OrderItemsSummary order={order} />
            <p className="status-email-note">
                Spara ditt ordernummer {order.orderNumber} om du behöver kontakta oss.
            </p>
            {!isAwaitingPayment && <BackToMenuButton onClick={onBack} />}
        </>
    );
}

function LivePickupView({ order, countdown }: { order: Order; countdown: string }) {
    const isAwaitingPayment = isAwaitingOnlinePayment(order);
    const isPending = order.status === 'ny' || order.status === 'mottagen';
    const isCompleted =
        order.status === 'klar' || order.status === 'uthämtad' || order.status === 'levererad';
    const isDelayed =
        !!order.estimatedReadyTime &&
        (parseApiTimestamp(order.estimatedReadyTime)?.getTime() ?? 0) < Date.now();
    const scheduledClockLabel = formatScheduledClock(order.scheduledTime);

    const stepIndex = STATUS_STEPS.indexOf(order.status as Order['status']);
    const currentStepIndex = stepIndex >= 0 ? stepIndex : order.status === 'mottagen' ? 1 : 0;

    return (
        <>
            <h1 className="text-display-md status-title">
                {isCompleted
                    ? 'Din beställning är klar! 🎉'
                    : isAwaitingPayment
                        ? 'Bekräftar din betalning…'
                        : isPending
                            ? 'Väntar på bekräftelse'
                            : 'Förbereder din beställning'}
            </h1>

            {!isCompleted && !isPending && !isAwaitingPayment && (
                <div className="timer-display">
                    <span className="timer-value">{countdown}</span>
                    <span className="text-body-md timer-label">Minuter kvar</span>
                </div>
            )}

            {scheduledClockLabel && !isAwaitingPayment && (
                <p className="status-hint">Önskad upphämtning: kl. {scheduledClockLabel}</p>
            )}

            <div className="status-steps">
                {STATUS_STEPS.map((step, index) => {
                    const done = currentStepIndex > index;
                    const active = currentStepIndex === index;
                    return (
                        <div
                            key={step}
                            className={`step ${done ? 'step--completed' : ''} ${active ? 'step--active' : ''}`}
                        >
                            <span className="step-dot" />
                            <span>{STEP_LABELS[step]}</span>
                        </div>
                    );
                })}
            </div>

            <p className="text-center status-message">
                {isCompleted
                    ? 'Du kan hämta din Kunafa nu!'
                    : isAwaitingPayment
                        ? 'Vi bekräftar din betalning. Sidan uppdateras automatiskt om några sekunder.'
                        : isPending
                            ? 'Din beställning har skickats och väntar på att bli accepterad.'
                            : isDelayed
                                ? 'Det tar lite längre än väntat — vi jobbar på din order.'
                                : 'Vi förbereder din färska Kunafa!'}
            </p>
        </>
    );
}

export const OrderStatus: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const orderId = searchParams.get('orderId');
    const stripeSessionId = searchParams.get('session_id');

    const [order, setOrder] = useState<Order | null>(null);
    const [countdown, setCountdown] = useState('--:--');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [confirmingPayment, setConfirmingPayment] = useState(Boolean(stripeSessionId));

    const liveTracking = order ? usesLivePickupTracking(order) : false;

    useEffect(() => {
        if (!orderId) {
            setError('Inget order-ID hittades.');
            setLoading(false);
            return;
        }

        const fetchOrder = async () => {
            try {
                const data = await orderApi.getById(orderId);
                setOrder(data);
                setError(null);
            } catch {
                setError('Kunde inte hämta beställningsstatus.');
            } finally {
                setLoading(false);
            }
        };

        const bootstrap = async () => {
            if (stripeSessionId) {
                try {
                    const confirmed = await orderApi.confirmStripeCheckout(orderId, stripeSessionId);
                    setOrder(confirmed);
                    setError(null);
                    setLoading(false);
                    setConfirmingPayment(false);
                    return;
                } catch (e) {
                    console.warn('[OrderStatus] stripe-confirm failed, falling back to poll:', e);
                    setConfirmingPayment(false);
                }
            }
            await fetchOrder();
        };

        void bootstrap();

        const awaitingPayment = order ? isAwaitingOnlinePayment(order) : false;
        let intervalMs: number;
        if (awaitingPayment) intervalMs = 2500;
        else if (order && !usesLivePickupTracking(order)) intervalMs = 60_000;
        else intervalMs = 5000;

        const pollId = setInterval(() => {
            void fetchOrder();
        }, intervalMs);
        return () => clearInterval(pollId);
    }, [orderId, stripeSessionId, order?.paymentMethod, order?.paymentStatus, order?.orderType, order?.scheduledTime]);

    useEffect(() => {
        if (!liveTracking || !order?.estimatedReadyTime) return;
        setCountdown(getCountdown(order.estimatedReadyTime));
        const id = setInterval(() => setCountdown(getCountdown(order.estimatedReadyTime)), 1000);
        return () => clearInterval(id);
    }, [liveTracking, order?.estimatedReadyTime]);

    const isCancelled = order?.status === 'avbruten';
    const isAwaitingPayment = order ? isAwaitingOnlinePayment(order) : false;
    const isCompleted =
        order?.status === 'klar' ||
        order?.status === 'uthämtad' ||
        order?.status === 'levererad';
    const isPending = order?.status === 'ny' || order?.status === 'mottagen';
    const isDelayed =
        liveTracking &&
        !!order?.estimatedReadyTime &&
        (parseApiTimestamp(order.estimatedReadyTime)?.getTime() ?? 0) < Date.now();

    const statusClass = isCancelled
        ? 'cancelled'
        : isCompleted && liveTracking
            ? 'almost-ready'
            : isPending
                ? 'on-time'
                : isDelayed
                    ? 'delayed'
                    : 'on-time';

    if (loading || confirmingPayment) {
        return (
            <div className="status-page">
                <Container className="status-container">
                    <p style={{ textAlign: 'center', padding: '2rem' }}>
                        {confirmingPayment ? 'Bekräftar din betalning…' : 'Hämtar beställningsstatus...'}
                    </p>
                </Container>
            </div>
        );
    }

    if (error || !order) {
        return (
            <div className="status-page">
                <Container className="status-container">
                    <div className="status-card status--on-time">
                        <p style={{ textAlign: 'center', color: '#c00' }}>{error ?? 'Beställning hittades inte.'}</p>
                        <button type="button" onClick={() => navigate('/')} className="status-back-btn">
                            ← Tillbaka till startsidan
                        </button>
                    </div>
                </Container>
            </div>
        );
    }

    return (
        <div className="status-page">
            <Container className="status-container">
                <div className={`status-card status--${statusClass}`}>
                    <p style={{ fontSize: '0.85rem', color: '#888', marginBottom: '0.25rem' }}>
                        Beställning {order.orderNumber}
                    </p>

                    {isCancelled ? (
                        <>
                            <h1 className="text-display-md status-title">Beställningen har avbrutits</h1>
                            <p className="text-center status-message" style={{ color: '#DC2626' }}>
                                Tyvärr har din beställning blivit avbruten. Kontakta oss om du har frågor.
                            </p>
                            {order.cancellationReason && (
                                <p className="text-center status-message" style={{ marginTop: '0.5rem' }}>
                                    Orsak: {order.cancellationReason}
                                </p>
                            )}
                            {order.cancelledAt && (
                                <p
                                    className="text-center status-message"
                                    style={{ marginTop: '0.25rem', fontSize: '0.9rem', color: '#666' }}
                                >
                                    Avbruten: {new Date(order.cancelledAt).toLocaleString('sv-SE')}
                                </p>
                            )}
                            <BackToMenuButton onClick={() => navigate('/')} />
                        </>
                    ) : liveTracking ? (
                        <LivePickupView order={order} countdown={countdown} />
                    ) : (
                        <SimpleConfirmationView
                            order={order}
                            isAwaitingPayment={isAwaitingPayment}
                            onBack={() => navigate('/')}
                        />
                    )}
                </div>
            </Container>
        </div>
    );
};
