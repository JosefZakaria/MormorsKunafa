import { useRef, useState } from 'react';
import { ERASABLE_RETENTION_FIELDS, RETENTION_FIELD_LABELS, RETENTION_REASON_LABELS, type RetentionField, type RetentionHoldInput, type RetentionErasureInput, type RetentionOrderPreview, type RetentionPreview as Preview } from '@shared/types';
import { orderApi } from '../../../services/api';
import { Button } from '../../../components/common/Button/Button';
import './RetentionPreview.css';

const STATUS_LABELS = {preserve: 'Bevaras', candidate: 'Förslag att gallra', waiting: 'Väntar på tidsgräns', hold: 'Undantagen', review: 'Manuell bedömning'};
const stockholmDate = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Stockholm'}).format(date);
const showDate = (value: string) => new Date(value.length === 10 ? `${value}T12:00:00Z` : value).toLocaleDateString('sv-SE', {timeZone: 'Europe/Stockholm'});
function requestError(cause: unknown, fallback: string): string {
  const message = (cause as {data?: {error?: unknown}} | null)?.data?.error;
  return typeof message === 'string' ? message : cause instanceof Error ? cause.message : fallback;
}

function ErasureForm({order, disabled, erase}: {order: RetentionOrderPreview; disabled: boolean; erase: (input: RetentionErasureInput) => Promise<void>}) {
  const [fields, setFields] = useState<RetentionField[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [closedOn, setClosedOn] = useState('');
  const [notesOnly, setNotesOnly] = useState(false);
  const [purposeEnded, setPurposeEnded] = useState(false);
  const choices = order.decisions.filter(decision => ERASABLE_RETENTION_FIELDS.includes(decision.field));
  const abandoned = choices.some(decision => decision.rule === 'abandoned_30_days');
  if (!choices.length) return null;
  return <details className="retention-hold-form">
    <summary>Gallra valda kunduppgifter</summary>
    <form aria-label="Gallra kunduppgifter" onSubmit={event => {
      event.preventDefault();
      if (window.confirm(`Gallra valda kunduppgifter för ${order.orderNumber}? Uppgifterna tas bort och kan inte ångras här. Ordern och bokföringsunderlaget ligger kvar.`)) {
        void erase({fields, version: order.version, confirmedNoAccountingNeed: confirmed,
          ...(!abandoned ? {closedOn, purposeEnded} : {}), notesOperationalOnly: notesOnly});
      }
    }}>
      <fieldset disabled={disabled}>
        <legend>Uppgifter att ta bort</legend>
        {choices.map(decision => <label key={decision.field}>
          <input type="checkbox" disabled={decision.status === 'hold' || decision.status === 'waiting' || (decision.field === 'identity_address' && !abandoned)}
            checked={fields.includes(decision.field)} onChange={event => setFields(previous => event.target.checked ? [...previous, decision.field] : previous.filter(field => field !== decision.field))} />
          {RETENTION_FIELD_LABELS[decision.field]}
        </label>)}
      </fieldset>
      {!abandoned && <label>Bekräftat avslutsdatum – order och kundärenden avslutade, inte bara köksklar
        <input type="date" required max={stockholmDate()} value={closedOn} disabled={disabled} onChange={event => setClosedOn(event.target.value)} />
      </label>}
      {!abandoned && <>
        <p>Ordinarie tidsgräns: 3 år för kontaktuppgifter och 90 dagar för rena arbetsanteckningar. Gallra tidigare om behovet upphört efter individuell bedömning. Bokföringsunderlag och nödvändig kundidentifiering bevaras.</p>
        {order.paymentStatus === 'paid' && <label><input type="checkbox" checked={purposeEnded} disabled={disabled} onChange={event => setPurposeEnded(event.target.checked)} />
          Individuell bedömning: behovet har upphört och valda uppgifter ska gallras tidigare än ordinarie tidsgräns.
        </label>}
      </>}
      {fields.includes('notes') && <label><input type="checkbox" checked={notesOnly} disabled={disabled} onChange={event => setNotesOnly(event.target.checked)} />Anteckningen innehåller bara tillfälliga arbetsinstruktioner.</label>}
      <label><input type="checkbox" checked={confirmed} disabled={disabled} onChange={event => setConfirmed(event.target.checked)} />
        Jag bekräftar att valda uppgifter inte längre behövs för bokföring, leverans, betalningsfordran eller pågående ärende.
      </label>
      <Button type="submit" size="sm" disabled={disabled || !confirmed || !fields.length || (!abandoned && !closedOn) || (fields.includes('notes') && !notesOnly)}>Gallra valda uppgifter</Button>
    </form>
  </details>;
}

function HoldForm({order, disabled, save}: {order: RetentionOrderPreview; disabled: boolean; save: (body: RetentionHoldInput) => Promise<void>}) {
  const [fields, setFields] = useState<RetentionField[]>([]);
  const [reason, setReason] = useState<RetentionHoldInput['reason']>('complaint');
  const [reviewOn, setReviewOn] = useState(stockholmDate(new Date(Date.now() + 30 * 86400000)));
  return <details className="retention-hold-form">
    <summary>Registrera pågående ärende</summary>
    <form onSubmit={event => {event.preventDefault(); void save({fields, reason, reviewOn});}}>
      <fieldset disabled={disabled}>
        <legend>Vilka uppgifter behöver undantas?</legend>
        {order.decisions.map(decision => <label key={decision.field}>
          <input type="checkbox" checked={fields.includes(decision.field)} onChange={event => setFields(previous =>
            event.target.checked ? [...previous, decision.field] : previous.filter(field => field !== decision.field))} />
          {RETENTION_FIELD_LABELS[decision.field]}
        </label>)}
      </fieldset>
      <label>Anledning
        <select value={reason} disabled={disabled} onChange={event => setReason(event.target.value as RetentionHoldInput['reason'])}>
          {Object.entries(RETENTION_REASON_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>Omprövningsdatum
        <input type="date" required min={stockholmDate()} value={reviewOn} disabled={disabled} onChange={event => setReviewOn(event.target.value)} />
      </label>
      <p>Du registreras som ansvarig. Datumet är en uppföljning, inte ett automatiskt slutdatum.</p>
      <Button type="submit" size="sm" disabled={disabled || fields.length === 0 || !reviewOn}>Spara undantag</Button>
    </form>
  </details>;
}

export function RetentionPreview({onErased}: {onErased: () => void}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const request = useRef(0);

  async function loadPage(nextPage: number) {
    const version = ++request.current;
    setLoading(true); setPreview(null); setError(''); setPage(nextPage);
    try {
      const result = await orderApi.getRetentionPreview(nextPage);
      if (request.current === version) setPreview(result);
    } catch (cause) {
      if (request.current === version) setError(requestError(cause, 'Förhandsgranskningen kunde inte hämtas.'));
    } finally {if (request.current === version) setLoading(false);}
  }

  async function changeHold(action: () => Promise<unknown>) {
    ++request.current;
    setLoading(true); setPreview(null); setError(''); setNotice('');
    try {await action(); await loadPage(page);}
    catch (cause) {setLoading(false); setError(requestError(cause, 'Undantaget kunde inte ändras. Läs om förhandsgranskningen.'));}
  }

  return <section className="retention-preview" aria-labelledby="retention-heading">
    <h2 id="retention-heading">Gallring</h2>
    <p>Kontrollera och gallra valda kunduppgifter, en order i taget. Ordern och bokföringsunderlaget bevaras. Historikens datum- och lokalfilter gäller inte här.</p>
    <Button variant="outline" aria-expanded={open} aria-controls="retention-results" onClick={() => setOpen(previous => !previous)}>
      {open ? 'Dölj gallringskontroll' : 'Visa gallringskontroll'}
    </Button>
    {open && <div id="retention-results" aria-busy={loading}>
      <p>Övergivna kortköp: förslag tidigast 30 dagar efter sista utgångna betalningssessionen. En eventuell leverans, fordran eller kundfråga utanför systemet måste också kontrolleras.</p>
      <Button size="sm" disabled={loading} onClick={() => void loadPage(page)}>{preview ? 'Kontrollera på nytt' : 'Hämta kontroll'}</Button>
      {loading && <p role="status">Arbetar. Vänta tills resultatet visas.</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {preview && <>
        {preview.warning && <p role="alert">{preview.warning}</p>}
        <p role="status">Kontrollerad {new Date(preview.generatedAt).toLocaleString('sv-SE', {timeZone: 'Europe/Stockholm'})}. Visar {preview.orders.length} av {preview.total} order, sida {preview.page}. Förslagen är inte ett godkännande att radera.</p>
        {preview.orders.map(order => <article key={order.id} className="retention-order" aria-label={`Gallringsbedömning ${order.orderNumber}`}>
          <h3>{order.orderNumber} · {order.status} · {order.paymentStatus === 'paid' ? 'Betald' : 'Väntande eller annan betalningsstatus'}</h3>
          <details><summary>Regler och bedömning</summary><ul className="retention-decisions">
            {order.decisions.map(decision => <li key={decision.field}>
              <strong>{RETENTION_FIELD_LABELS[decision.field]} — {STATUS_LABELS[decision.status]}</strong>
              <p>{decision.reason}</p>
              {decision.eligibleFrom && <p>{decision.rule === 'accounting_calendar_year' ? 'Preliminär tidigaste omprövning' : 'Tidsgräns'}: {showDate(decision.eligibleFrom)}</p>}
            </li>)}
          </ul></details>
          {order.holds.map(hold => <div key={hold.id} className="retention-hold">
            <p><strong>{hold.releasedAt ? 'Avslutat undantag' : 'Pågående undantag'}</strong>: {RETENTION_REASON_LABELS[hold.reason]}</p>
            <p>{hold.fields.map(field => RETENTION_FIELD_LABELS[field]).join(', ')}</p>
            <p>Ansvarig: {hold.responsibleName}. Omprövning: {showDate(hold.reviewOn)}.
              {!hold.releasedAt && hold.reviewOn < stockholmDate() && ' Behöver följas upp. Undantaget gäller fortfarande.'}</p>
            {hold.releasedAt ? <p>Avslutat {showDate(hold.releasedAt)}.</p> : <Button variant="ghost" size="sm" disabled={loading}
              onClick={() => {if (window.confirm('Avsluta detta undantag? Kontrollera att berörda uppgifter inte längre behöver sparas för ärendet. Inga orderuppgifter raderas.')) void changeHold(() => orderApi.releaseRetentionHold(hold.id));}}>
              Avsluta undantag
            </Button>}
          </div>)}
          <HoldForm order={order} disabled={loading} save={body => changeHold(() => orderApi.createRetentionHold(order.id, body))} />
          <ErasureForm order={order} disabled={loading} erase={body => changeHold(async () => {
            const result = await orderApi.eraseRetainedFields(order.id, body);
            onErased();
            setNotice(`Gallringen är utförd för ${order.orderNumber}. Körning: ${result.runId}. Bokföringsunderlaget är bevarat.`);
          })} />
        </article>)}
        <nav className="retention-pagination" aria-label="Sidor i gallringsförhandsgranskning">
          <Button size="sm" variant="outline" disabled={loading || page <= 1} onClick={() => void loadPage(page - 1)}>Föregående sida</Button>
          <Button size="sm" variant="outline" disabled={loading || page * preview.pageSize >= preview.total} onClick={() => void loadPage(page + 1)}>Nästa sida</Button>
        </nav>
      </>}
    </div>}
  </section>;
}
