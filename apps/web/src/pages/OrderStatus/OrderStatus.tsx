import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Container } from '../../components/common/Container/Container';
import { orderApi } from '../../services/api';
import type { Order } from '@shared/types';
import './OrderStatus.css';

function getCountdown(isoTime: string | undefined): string {
    if (!isoTime) return '--:--';
    const diff = new Date(isoTime).getTime() - Date.now();
    if (diff <= 0) return '00:00';
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const STATUS_STEPS: Order['status'][] = ['ny', 'påbörjad', 'klar'];

const STEP_LABELS: Record<string, string> = {
    ny: 'Skickad',
    påbörjad: 'Förbereder',
    klar: 'Klar',
};

export const OrderStatus: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const orderId = searchParams.get('orderId');

    const [order, setOrder] = useState<Order | null>(null);
    const [countdown, setCountdown] = useState('--:--');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // Fetch order and poll every 5s
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

        fetchOrder();
        const pollId = setInterval(fetchOrder, 5000);
        return () => clearInterval(pollId);
    }, [orderId]);

    // Live countdown timer
    useEffect(() => {
        if (!order?.estimatedReadyTime) return;
        setCountdown(getCountdown(order.estimatedReadyTime));
        const id = setInterval(() => setCountdown(getCountdown(order.estimatedReadyTime)), 1000);
        return () => clearInterval(id);
    }, [order?.estimatedReadyTime]);

    const isCancelled = order?.status === 'avbruten';
    const isPending = order?.status === 'ny' || order?.status === 'mottagen';
    const isCompleted = order?.status === 'klar' || order?.status === 'uthämtad' || order?.status === 'levererad';
    const statusClass = isCancelled ? 'cancelled' : isCompleted ? 'almost-ready' : isPending ? 'on-time' : countdown === '00:00' ? 'delayed' : 'on-time';

    const stepIndex = order ? STATUS_STEPS.indexOf(order.status as Order['status']) : 0;
    const currentStepIndex = stepIndex >= 0 ? stepIndex : order?.status === 'mottagen' ? 1 : 0;

    if (loading) {
        return (
            <div className="status-page">
                <Container className="status-container">
                    <p style={{ textAlign: 'center', padding: '2rem' }}>Hämtar beställningsstatus...</p>
                </Container>
            </div>
        );
    }

    if (error || !order) {
        return (
            <div className="status-page">
                <Container className="status-container">
                    <div className={`status-card status--on-time`}>
                        <p style={{ textAlign: 'center', color: '#c00' }}>{error ?? 'Beställning hittades inte.'}</p>
                        <button onClick={() => navigate('/')} style={{ marginTop: '1rem', cursor: 'pointer' }}>
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
                            <h1 className="text-display-md status-title">
                                Beställningen har avbrutits
                            </h1>
                            <p className="text-center status-message" style={{ color: '#DC2626' }}>
                                Tyvärr har din beställning blivit avbruten. Kontakta oss om du har frågor.
                            </p>
                            <button
                                onClick={() => navigate('/')}
                                style={{ marginTop: '1.5rem', cursor: 'pointer', padding: '0.5rem 1.5rem', borderRadius: '8px', border: '1px solid #ccc', background: '#fff' }}
                            >
                                Tillbaka till menyn
                            </button>
                        </>
                    ) : (
                        <>
                            <h1 className="text-display-md status-title">
                                {isCompleted
                                    ? 'Din beställning är klar! 🎉'
                                    : isPending
                                        ? 'Väntar på bekräftelse'
                                        : 'Förbereder din beställning'}
                            </h1>

                            {!isCompleted && !isPending && (
                                <div className="timer-display">
                                    <span className="timer-value">{countdown}</span>
                                    <span className="text-body-md timer-label">Minuter kvar</span>
                                </div>
                            )}

                            <div className="status-steps">
                                {STATUS_STEPS.map((step, index) => {
                                    const done = currentStepIndex > index;
                                    const active = currentStepIndex === index;
                                    return (
                                        <div key={step} className={`step ${done ? 'step--completed' : ''} ${active ? 'step--active' : ''}`}>
                                            <span className="step-dot"></span>
                                            <span>{STEP_LABELS[step]}</span>
                                        </div>
                                    );
                                })}
                            </div>

                            <p className="text-center status-message">
                                {isCompleted
                                    ? 'Du kan hämta din Kunafa nu!'
                                    : isPending
                                        ? 'Din beställning har skickats och väntar på att bli accepterad.'
                                        : 'Vi förbereder din färska Kunafa!'}
                            </p>
                        </>
                    )}
                </div>
            </Container>
        </div>
    );
};

