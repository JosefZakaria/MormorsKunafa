import { useCallback, useEffect, useRef, useState } from 'react';
import type { DuplicatePaymentAlertDetail } from '@shared/types';
import { Button } from '../../../components/common/Button/Button';
import { AccessibleDialog } from '../../../components/common/AccessibleDialog/AccessibleDialog';
import { adminApi } from '../../../services/api';

type Stage = 'warning' | 'review' | 'authorize';

function formatOre(amount: number): string {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(amount / 100);
}

function apiErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { data?: { error?: unknown } })?.data;
  return typeof data?.error === 'string' ? data.error : fallback;
}

export function DuplicatePaymentRefundModal({
  eventId,
  onClose,
}: {
  eventId: string | null;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<Stage>('warning');
  const [detail, setDetail] = useState<DuplicatePaymentAlertDetail | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKeyRef = useRef(`duplicate-refund:${crypto.randomUUID()}`);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      setDetail(await adminApi.getPaymentAlertDetail(eventId));
      setError(null);
    } catch (loadError) {
      setError(apiErrorMessage(loadError, 'Kunde inte verifiera betalningslarmet.'));
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    setStage('warning');
    setDetail(null);
    setPassword('');
    setConfirmation('');
    setError(null);
    idempotencyKeyRef.current = `duplicate-refund:${crypto.randomUUID()}`;
    void load();
  }, [eventId, load]);

  if (!eventId) return null;
  const eligible = detail?.status === 'eligible';
  const complete = detail?.status === 'succeeded';
  const pending = detail?.status === 'pending';
  const expected = detail?.confirmation ?? '';

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await adminApi.refundDuplicatePayment(
        eventId,
        { password, confirmation },
        idempotencyKeyRef.current
      );
      setDetail(result);
      setPassword('');
      setConfirmation('');
    } catch (submitError) {
      setError(apiErrorMessage(submitError, 'Dubbelbetalningen kunde inte återbetalas.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AccessibleDialog
      labelledBy="duplicate-refund-dialog-title"
      onClose={onClose}
      closeDisabled={submitting}
      dialogClassName="refund-modal duplicate-refund-modal"
    >
        <h2 id="duplicate-refund-dialog-title">Granska dubbelbetalning</h2>
        <code className="duplicate-refund-event">{eventId}</code>

        {loading && <p>Verifierar event och betalning direkt hos Stripe...</p>}
        {!loading && detail?.status === 'investigation_only' && (
          <div className="refund-warning" role="alert">
            <strong>Ingen automatisk återbetalning tillåts</strong>
            <span>Betalningen matchar inte alla säkra villkor. Utred eventet manuellt i Stripe.</span>
          </div>
        )}
        {!loading && complete && (
          <p className="refund-success" role="status">Dubbelbetalningen är återbetald.</p>
        )}
        {!loading && pending && (
          <div className="refund-warning" role="status">
            <strong>Återbetalningen behandlas</strong>
            <span>Stripe har tagit emot begäran. Öppna larmet igen för att stämma av status.</span>
          </div>
        )}

        {!loading && eligible && stage === 'warning' && (
          <>
            <div className="refund-warning" role="alert">
              <strong>Varning: riktiga pengar skickas tillbaka</strong>
              <span>Detta är en separat andra Stripe-betalning och inte orderns vanliga artikelretur.</span>
            </div>
            <p className="refund-danger-text">Är du säker på att du vill granska återbetalningen?</p>
            <div className="stats-modal-actions">
              <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>Nej</Button>
              <Button variant="primary" onClick={() => setStage('review')} style={{ flex: 1 }}>Ja, fortsätt</Button>
            </div>
          </>
        )}

        {!loading && eligible && stage === 'review' && (
          <>
            <div className="refund-summary duplicate-refund-summary">
              <span>Order: <strong>{detail.orderNumber}</strong></span>
              <span>Hela andra betalningen: <strong>{formatOre(detail.amount ?? 0)}</strong></span>
              <span>Den ursprungliga orderbetalningen påverkas inte.</span>
            </div>
            <p>Den separata betalningen kan bara återbetalas i sin helhet.</p>
            <div className="stats-modal-actions">
              <Button variant="ghost" onClick={() => setStage('warning')} style={{ flex: 1 }}>Tillbaka</Button>
              <Button variant="primary" onClick={() => setStage('authorize')} style={{ flex: 1 }}>Fortsätt</Button>
            </div>
          </>
        )}

        {!loading && eligible && stage === 'authorize' && (
          <>
            <div className="refund-total">Belopp: <strong>{formatOre(detail.amount ?? 0)}</strong></div>
            <label className="refund-field-label" htmlFor="duplicate-refund-password">Återbetalningslösenord</label>
            <input
              id="duplicate-refund-password"
              className="stats-modal-input"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <label className="refund-field-label" htmlFor="duplicate-refund-confirmation">
              Skriv exakt: <strong>{expected}</strong>
            </label>
            <input
              id="duplicate-refund-confirmation"
              className="stats-modal-input"
              autoComplete="off"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
            <div className="stats-modal-actions">
              <Button variant="ghost" disabled={submitting} onClick={() => setStage('review')} style={{ flex: 1 }}>
                Tillbaka
              </Button>
              <Button
                variant="primary"
                disabled={submitting || !password || confirmation !== expected}
                onClick={() => void submit()}
                style={{ flex: 1, background: '#B91C1C' }}
              >{submitting ? 'Behandlar...' : 'Återbetala dubbelbetalning'}</Button>
            </div>
          </>
        )}

        {error && <p className="stats-modal-error">{error}</p>}
        {!loading && (!eligible || complete || pending) && (
          <div className="stats-modal-actions">
            <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>Stäng</Button>
            {pending && <Button variant="primary" onClick={() => void load()} style={{ flex: 1 }}>Stäm av igen</Button>}
          </div>
        )}
    </AccessibleDialog>
  );
}
