import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminRefundOverview, Order } from '@shared/types';
import { Button } from '../../../components/common/Button/Button';
import { adminApi } from '../../../services/api';

type Stage = 'warning' | 'selection' | 'authorize';

function apiErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { data?: { error?: unknown } })?.data;
  return typeof data?.error === 'string' ? data.error : fallback;
}

function formatOre(amount: number): string {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(amount / 100);
}

export function RefundOrderModal({
  open,
  order,
  onClose,
  onChanged,
}: {
  open: boolean;
  order: Order | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [stage, setStage] = useState<Stage>('warning');
  const [overview, setOverview] = useState<AdminRefundOverview | null>(null);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const idempotencyKeyRef = useRef(`refund:${crypto.randomUUID()}`);

  const loadOverview = useCallback(async () => {
    if (!order) return;
    setLoading(true);
    try {
      setOverview(await adminApi.getRefundOverview(order.id));
      setError(null);
    } catch (loadError) {
      setError(apiErrorMessage(loadError, 'Kunde inte hämta återbetalningsinformationen.'));
    } finally {
      setLoading(false);
    }
  }, [order]);

  useEffect(() => {
    if (!open || !order) return;
    setStage('warning');
    setOverview(null);
    setSelected({});
    setPassword('');
    setConfirmation('');
    setError(null);
    setMessage(null);
    idempotencyKeyRef.current = `refund:${crypto.randomUUID()}`;
    void loadOverview();
  }, [open, order, loadOverview]);

  const selectedTotal = useMemo(() => {
    if (!overview) return 0;
    return overview.items.reduce(
      (sum, item) => sum + (selected[item.orderItemId] ?? 0) * item.unitPrice,
      0
    );
  }, [overview, selected]);

  if (!open || !order) return null;
  const expectedConfirmation = `ÅTERBETALA ${order.orderNumber}`;
  const pendingAttempts = overview?.attempts.filter((attempt) => attempt.status === 'pending') ?? [];

  const toggleAll = () => {
    if (!overview) return;
    const available = overview.items.filter((item) => item.refundableQuantity > 0);
    const allSelected = available.length > 0 && available.every(
      (item) => selected[item.orderItemId] === item.refundableQuantity
    );
    setSelected(allSelected ? {} : Object.fromEntries(
      available.map((item) => [item.orderItemId, item.refundableQuantity])
    ));
  };

  const submitRefund = async () => {
    if (!overview || selectedTotal <= 0) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const result = await adminApi.createRefund(order.id, {
        password,
        confirmation,
        items: Object.entries(selected)
          .filter(([, quantity]) => quantity > 0)
          .map(([orderItemId, quantity]) => ({ orderItemId, quantity })),
      }, idempotencyKeyRef.current);
      setMessage(result.status === 'succeeded'
        ? `${formatOre(result.amount)} har återbetalats.`
        : `Återbetalning på ${formatOre(result.amount)} behandlas av betalningsleverantören.`);
      setSelected({});
      idempotencyKeyRef.current = `refund:${crypto.randomUUID()}`;
      await loadOverview();
      onChanged();
    } catch (submitError) {
      setError(apiErrorMessage(submitError, 'Återbetalningen kunde inte genomföras.'));
    } finally {
      setSubmitting(false);
    }
  };

  const reconcile = async (refundId: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await adminApi.reconcileRefund(order.id, refundId, { password, confirmation });
      setMessage(result.status === 'pending'
        ? 'Betalningsleverantören behandlar fortfarande återbetalningen.'
        : result.status === 'succeeded'
          ? 'Återbetalningen är bekräftad.'
          : 'Betalningsleverantören markerade återbetalningen som misslyckad.');
      await loadOverview();
      onChanged();
    } catch (reconcileError) {
      setError(apiErrorMessage(reconcileError, 'Kunde inte stämma av återbetalningen.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="stats-modal-overlay" onClick={submitting ? undefined : onClose}>
      <div className="stats-modal refund-modal" onClick={(event) => event.stopPropagation()}>
        <h2>Återbetala {order.orderNumber}</h2>

        {stage === 'warning' && (
          <>
            <div className="refund-warning" role="alert">
              <strong>Varning</strong>
              <span>En bekräftad återbetalning skickar riktiga pengar tillbaka till kunden.</span>
            </div>
            <p className="refund-danger-text">Är du säker på att du vill fortsätta?</p>
            <div className="stats-modal-actions">
              <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>Nej</Button>
              <Button variant="primary" onClick={() => setStage('selection')} style={{ flex: 1 }}>Ja, fortsätt</Button>
            </div>
          </>
        )}

        {stage === 'selection' && (
          <>
            {loading && <p>Laddar återbetalningsbara rader...</p>}
            {overview && (
              <>
                <div className="refund-summary">
                  <span>Betalt: {formatOre(overview.totalPrice)}</span>
                  <span>Redan återbetalt: {formatOre(overview.refundedAmount)}</span>
                  <span>Tillgängligt: {formatOre(overview.refundableAmount)}</span>
                </div>
                <label className="refund-select-all">
                  <input
                    type="checkbox"
                    checked={overview.items.some((item) => item.refundableQuantity > 0)
                      && overview.items.filter((item) => item.refundableQuantity > 0)
                        .every((item) => selected[item.orderItemId] === item.refundableQuantity)}
                    onChange={toggleAll}
                  />
                  Välj allt återstående
                </label>
                <div className="refund-items">
                  {overview.items.map((item) => {
                    const quantity = selected[item.orderItemId] ?? 0;
                    return (
                      <div className="refund-item" key={item.orderItemId}>
                        <label>
                          <input
                            type="checkbox"
                            disabled={item.refundableQuantity === 0}
                            checked={quantity > 0}
                            onChange={(event) => setSelected((current) => ({
                              ...current,
                              [item.orderItemId]: event.target.checked ? item.refundableQuantity : 0,
                            }))}
                          />
                          <span>
                            <strong>{item.productName}</strong>
                            <small>{formatOre(item.unitPrice)} per styck · {item.refundableQuantity} kvar</small>
                          </span>
                        </label>
                        {quantity > 0 && (
                          <input
                            aria-label={`Antal ${item.productName}`}
                            className="refund-quantity"
                            type="number"
                            min={1}
                            max={item.refundableQuantity}
                            value={quantity}
                            onChange={(event) => {
                              const next = Math.min(item.refundableQuantity, Math.max(1, Number(event.target.value)));
                              setSelected((current) => ({ ...current, [item.orderItemId]: next }));
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="refund-total">Vald återbetalning: <strong>{formatOre(selectedTotal)}</strong></div>
              </>
            )}
            {error && <p className="stats-modal-error">{error}</p>}
            <div className="stats-modal-actions">
              <Button variant="ghost" onClick={() => setStage('warning')} style={{ flex: 1 }}>Tillbaka</Button>
              <Button
                variant="primary"
                disabled={!overview || (selectedTotal <= 0 && pendingAttempts.length === 0)}
                onClick={() => setStage('authorize')}
                style={{ flex: 1 }}
              >Fortsätt</Button>
            </div>
          </>
        )}

        {stage === 'authorize' && (
          <>
            <div className="refund-total">Belopp: <strong>{formatOre(selectedTotal)}</strong></div>
            <label className="refund-field-label" htmlFor="refund-password">Återbetalningslösenord</label>
            <input
              id="refund-password"
              className="stats-modal-input"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <label className="refund-field-label" htmlFor="refund-confirmation">
              Skriv exakt: <strong>{expectedConfirmation}</strong>
            </label>
            <input
              id="refund-confirmation"
              className="stats-modal-input"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
            />
            {pendingAttempts.length > 0 && (
              <div className="refund-pending-list">
                <strong>Pågående återbetalningar</strong>
                {pendingAttempts.map((attempt) => (
                  <Button
                    key={attempt.id}
                    size="sm"
                    variant="ghost"
                    disabled={submitting || !password || confirmation !== expectedConfirmation}
                    onClick={() => void reconcile(attempt.id)}
                  >Stäm av {formatOre(attempt.amount)}</Button>
                ))}
              </div>
            )}
            {message && <p className="refund-success" role="status">{message}</p>}
            {error && <p className="stats-modal-error">{error}</p>}
            <div className="stats-modal-actions">
              <Button variant="ghost" disabled={submitting} onClick={() => setStage('selection')} style={{ flex: 1 }}>
                Tillbaka
              </Button>
              <Button
                variant="primary"
                disabled={submitting || selectedTotal <= 0 || !password || confirmation !== expectedConfirmation}
                onClick={() => void submitRefund()}
                style={{ flex: 1, background: '#B91C1C' }}
              >{submitting ? 'Behandlar...' : 'Återbetala nu'}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
