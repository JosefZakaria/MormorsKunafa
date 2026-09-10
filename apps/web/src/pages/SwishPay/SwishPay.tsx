import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Container } from '../../components/common/Container/Container';
import {
  clearPendingCheckoutOrder,
  markPendingCheckoutPaymentStarted,
  orderApi,
  readPendingCheckoutOrder,
} from '../../services/api';
import { safePaymentRedirectUrl } from '@shared/utils/paymentRedirect.ts';
import { useCart } from '../../contexts/CartContext';
import { removePersistentValue, STORAGE_KEYS } from '../../utils/browserStorage';
import './SwishPay.css';

const SWISH_RECONCILIATION_MESSAGE =
  'En beställning kan redan ha skapats. Betala eller beställ inte igen innan personalen har kontrollerat den. Ring 072-868 25 92 eller mejla Mormorskunafa@gmail.com.';

export const SwishPay: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const orderId = searchParams.get('orderId');

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentPageUrl, setPaymentPageUrl] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string>('');
  const [amountKr, setAmountKr] = useState<string>('');

  const goToStatus = useCallback(() => {
    if (orderId) navigate(`/status?orderId=${encodeURIComponent(orderId)}`);
  }, [navigate, orderId]);

  useEffect(() => {
    if (!orderId) {
      setError('Inget order-ID.');
      setLoading(false);
      return;
    }
    const pending = readPendingCheckoutOrder();
    if (!pending || pending.orderId !== orderId || pending.paymentMethod !== 'swish') {
      setError(SWISH_RECONCILIATION_MESSAGE);
      setLoading(false);
      return;
    }
    if (pending.contract !== 'current') {
      setError(SWISH_RECONCILIATION_MESSAGE);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const start = async () => {
      if (pending.paymentStarted) {
        setLoading(false);
        return;
      }
      try {
        if (!markPendingCheckoutPaymentStarted(orderId)) {
          throw new Error('Beställningsförsöket kunde inte bevaras lokalt.');
        }
        const created = await orderApi.createSwishPayment(orderId);
        if (cancelled) return;
        if (!Number.isSafeInteger(created.amountOre) || created.amountOre <= 0) {
          throw new Error('Swish returnerade ett ogiltigt belopp.');
        }
        setOrderNumber(String(created.orderNumber ?? ''));
        setAmountKr(((created.amountOre ?? 0) / 100).toFixed(0));
        if (created.paymentPageUrl) {
          const safeUrl = safePaymentRedirectUrl(created.paymentPageUrl, 'swish');
          if (!safeUrl) throw new Error('Swish returnerade en ogiltig betalningsadress.');
          setPaymentPageUrl(safeUrl);
        }
        clearCart();
        removePersistentValue(STORAGE_KEYS.cart);
        setLoading(false);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg =
          err && typeof err === 'object' && 'data' in err
            ? String((err as { data?: { error?: string } }).data?.error ?? SWISH_RECONCILIATION_MESSAGE)
            : SWISH_RECONCILIATION_MESSAGE;
        setError(msg);
        setLoading(false);
      }
    };

    void start();

    const poll = setInterval(async () => {
      try {
        const st = await orderApi.getSwishPaymentStatus(orderId);
        if (st.paymentStatus === 'paid') {
          clearInterval(poll);
          clearPendingCheckoutOrder(orderId);
          clearCart();
          removePersistentValue(STORAGE_KEYS.cart);
          goToStatus();
        } else if (st.paymentPageUrl && !paymentPageUrl) {
          const safeUrl = safePaymentRedirectUrl(st.paymentPageUrl, 'swish');
          if (safeUrl) setPaymentPageUrl(safeUrl);
        }
      } catch {
        /* ignore poll errors */
      }
    }, 2500);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [goToStatus, orderId]);

  if (loading) {
    return (
      <div className="swish-pay-page">
        <Container>
          <p style={{ textAlign: 'center' }}>Förbereder Swish-betalning…</p>
        </Container>
      </div>
    );
  }

  if (error) {
    return (
      <div className="swish-pay-page">
        <Container>
          <div className="swish-pay-card">
            <p className="swish-pay-error">{error}</p>
            <button type="button" className="swish-pay-link" onClick={() => navigate('/cart')}>
              Tillbaka till varukorgen
            </button>
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div className="swish-pay-page">
      <Container>
        <div className="swish-pay-card">
          <h1>Betala med Swish</h1>
          {orderNumber && <p>Order {orderNumber}</p>}
          {amountKr && <p className="swish-pay-amount">{amountKr} kr</p>}

          {paymentPageUrl ? (
            <a
              href={paymentPageUrl}
              className="swish-pay-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              Öppna Swish och betala
            </a>
          ) : (
            <p className="swish-pay-hint">
              Öppna Swish-appen på telefonen. Betalningsförfrågan skickas till numret du angav vid
              beställning.
            </p>
          )}

          <p className="swish-pay-hint">
            Sidan uppdateras automatiskt när betalningen är klar.
          </p>

          <button type="button" className="swish-pay-link" style={{ marginTop: '1rem' }} onClick={goToStatus}>
            Till orderstatus
          </button>
        </div>
      </Container>
    </div>
  );
};
