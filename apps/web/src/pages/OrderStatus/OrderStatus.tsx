import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { OrderStatus as OrderStatusValue, PublicOrderStatus } from '@shared/types';
import { parseApiTimestamp } from '@shared/utils/parseApiTimestamp';
import { Container } from '../../components/common/Container/Container';
import { orderApi } from '../../services/api';
import './OrderStatus.css';

const STATUS_STEPS: OrderStatusValue[] = ['ny', 'påbörjad', 'klar'];
const STEP_LABELS: Record<string, string> = {
  ny: 'Skickad',
  mottagen: 'Mottagen',
  påbörjad: 'Förbereder',
  klar: 'Klar',
  uthämtad: 'Uthämtad',
  levererad: 'Levererad',
};

function getCountdown(isoTime?: string): string {
  if (!isoTime) return '--:--';
  const target = parseApiTimestamp(isoTime);
  if (!target) return '--:--';
  const difference = target.getTime() - Date.now();
  const absolute = Math.abs(difference);
  const minutes = Math.floor(absolute / 60_000);
  const seconds = Math.floor((absolute % 60_000) / 1000);
  const value = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return difference < 0 ? `-${value}` : value;
}

export const OrderStatus: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderId = searchParams.get('orderId');
  const stripeSessionId = searchParams.get('session_id');
  const [order, setOrder] = useState<PublicOrderStatus | null>(null);
  const [countdown, setCountdown] = useState('--:--');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) {
      setError('Inget order-ID hittades.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const status = await orderApi.getById(orderId);
        if (!cancelled) {
          setOrder(status);
          setError(null);
        }
      } catch {
        if (!cancelled) setError('Kunde inte hämta beställningsstatus.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const start = async () => {
      if (stripeSessionId) {
        try {
          const status = await orderApi.confirmStripeCheckout(orderId, stripeSessionId);
          if (!cancelled) {
            setOrder(status);
            setError(null);
            setLoading(false);
          }
          return;
        } catch (confirmationError) {
          console.warn('[OrderStatus] Stripe confirmation delayed:', confirmationError);
        }
      }
      await fetchStatus();
    };

    void start();
    const pollId = window.setInterval(() => void fetchStatus(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [orderId, stripeSessionId]);

  useEffect(() => {
    if (!order?.estimatedReadyTime) return;
    setCountdown(getCountdown(order.estimatedReadyTime));
    const timerId = window.setInterval(
      () => setCountdown(getCountdown(order.estimatedReadyTime)),
      1000
    );
    return () => window.clearInterval(timerId);
  }, [order?.estimatedReadyTime]);

  if (loading) {
    return <div className="status-page"><Container><p>Hämtar beställningsstatus…</p></Container></div>;
  }
  if (error || !order) {
    return (
      <div className="status-page">
        <Container className="status-container">
          <div className="status-card status--on-time">
            <p className="text-center">{error ?? 'Beställningen hittades inte.'}</p>
            <button type="button" className="status-back-btn" onClick={() => navigate('/')}>
              Tillbaka till startsidan
            </button>
          </div>
        </Container>
      </div>
    );
  }

  const cancelled = order.status === 'avbruten';
  const completed = ['klar', 'uthämtad', 'levererad'].includes(order.status);
  const currentIndex = order.status === 'mottagen'
    ? 1
    : Math.max(0, STATUS_STEPS.indexOf(order.status));

  return (
    <div className="status-page">
      <Container className="status-container">
        <div className={`status-card status--${cancelled ? 'cancelled' : completed ? 'almost-ready' : 'on-time'}`}>
          <p className="text-center">Beställning {order.orderNumber}</p>
          <h1 className="text-display-md status-title">
            {cancelled ? 'Beställningen har avbrutits' : completed ? 'Din beställning är klar!' : 'Vi förbereder din beställning'}
          </h1>
          {!cancelled && order.estimatedReadyTime && !completed && (
            <div className="timer-display">
              <span className="timer-value">{countdown}</span>
              <span className="text-body-md timer-label">Minuter kvar</span>
            </div>
          )}
          {!cancelled && (
            <div className="status-steps">
              {STATUS_STEPS.map((step, index) => (
                <div key={step} className={`step ${index < currentIndex ? 'step--completed' : ''} ${index === currentIndex ? 'step--active' : ''}`}>
                  <span className="step-dot" />
                  <span>{STEP_LABELS[step]}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-center status-message">
            {cancelled
              ? 'Kontakta oss och uppge ordernumret om du har frågor.'
              : completed
                ? 'Din beställning är färdig. Spara ordernumret om du behöver kontakta oss.'
                : `Aktuell status: ${STEP_LABELS[order.status] ?? order.status}.`}
          </p>
          <button type="button" className="status-back-btn" onClick={() => navigate('/')}>
            Tillbaka till menyn
          </button>
        </div>
      </Container>
    </div>
  );
};
