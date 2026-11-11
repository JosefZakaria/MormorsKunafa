import { useState, type FormEvent } from 'react';
import type { Location, OpeningDayHours, OpeningHoursSchedule } from '@shared/types';
import { defaultOpeningHours, isOpeningDate, parseOpeningHours } from '@shared/utils/openingHours';
import { todayInStockholmDateString } from '@shared/utils/scheduledTime';
import { adminApi } from '../../../services/api';
import { Button } from '../../../components/common/Button/Button';
import './OpeningHoursSettings.css';

const WEEKDAYS = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];

function DayHoursFields({ label, hours, onChange }: {
    label: string;
    hours: OpeningDayHours | null;
    onChange: (hours: OpeningDayHours | null) => void;
}) {
    return <fieldset className="opening-hours__day">
        <legend>{label}</legend>
        <label className="opening-hours__closed">
            <input type="checkbox" checked={hours === null}
                onChange={event => onChange(event.target.checked ? null : { open: '11:00', close: '22:00' })} />
            Stängt
        </label>
        {hours !== null && <>
            <label>Öppnar<input type="time" required value={hours.open}
                onChange={event => onChange({ ...hours, open: event.target.value })} /></label>
            <label>Stänger<input type="time" required value={hours.close}
                onChange={event => onChange({ ...hours, close: event.target.value })} /></label>
        </>}
    </fieldset>;
}

function OpeningHoursEditor({ location, onSaved }: { location: Location; onSaved: (location: Location) => void }) {
    const [draft, setDraft] = useState<OpeningHoursSchedule>(() => location.openingHours ?? defaultOpeningHours(location.slug));
    const [exceptionDate, setExceptionDate] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const change = (next: OpeningHoursSchedule) => { setDraft(next); setSaved(false); setError(null); };
    const save = async (event: FormEvent) => {
        event.preventDefault();
        setError(null);
        setSaved(false);
        setSaving(true);
        try {
            const openingHours = parseOpeningHours(draft);
            const updated = await adminApi.updateLocation(location.id, { openingHours });
            setDraft(updated.openingHours ?? openingHours);
            onSaved(updated);
            setSaved(true);
            // Other customer tabs on this device can refresh immediately.
            try { localStorage.setItem('opening-hours-updated', String(Date.now())); } catch { /* Storage can be unavailable. */ }
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Kunde inte spara öppettiderna.');
        } finally {
            setSaving(false);
        }
    };

    return <form onSubmit={save}>
        <fieldset className="opening-hours__fields" disabled={saving}>
            <legend className="opening-hours__heading">Veckoschema för {location.name}</legend>
            {[1, 2, 3, 4, 5, 6, 0].map(day => <DayHoursFields key={day} label={WEEKDAYS[day]}
                hours={draft.weekly[day]} onChange={hours => change({ ...draft, weekly: { ...draft.weekly, [day]: hours } })} />)}
            <h4>Undantag för enskilda datum</h4>
            <p>Ett datumundantag ersätter veckoschemat för den dagen. Ta bort undantaget för att använda veckoschemat igen.</p>
            {Object.entries(draft.exceptions).sort(([a], [b]) => a.localeCompare(b)).map(([date, hours]) =>
                <div className="opening-hours__exception" key={date}>
                    <DayHoursFields label={date} hours={hours}
                        onChange={value => change({ ...draft, exceptions: { ...draft.exceptions, [date]: value } })} />
                    <Button type="button" variant="ghost" size="sm" aria-label={`Ta bort undantag ${date}`} onClick={() => {
                        const exceptions = { ...draft.exceptions };
                        delete exceptions[date];
                        change({ ...draft, exceptions });
                    }}>Ta bort</Button>
                </div>
            )}
            <div className="opening-hours__add">
                <label>Datum<input type="date" min={todayInStockholmDateString()} value={exceptionDate}
                    onChange={event => setExceptionDate(event.target.value)} /></label>
                <Button type="button" variant="secondary" size="sm" disabled={!isOpeningDate(exceptionDate)} onClick={() => {
                    if (Object.prototype.hasOwnProperty.call(draft.exceptions, exceptionDate)) {
                        setError('Det finns redan ett undantag för det datumet.');
                        return;
                    }
                    change({ ...draft, exceptions: { ...draft.exceptions, [exceptionDate]: null } });
                    setExceptionDate('');
                }}>Lägg till datum</Button>
            </div>
            <Button type="submit" disabled={saving}>{saving ? 'Sparar…' : `Spara öppettider för ${location.name}`}</Button>
        </fieldset>
        {error && <p className="opening-hours__error" role="alert">{error}</p>}
        {saved && <p role="status">Öppettiderna för {location.name} är sparade. Hemsidan uppdateras automatiskt.</p>}
    </form>;
}

export function OpeningHoursSettings({ locations, onSaved }: { locations: Location[]; onSaved: (location: Location) => void }) {
    const [selectedId, setSelectedId] = useState(locations[0]?.id ?? '');
    const selected = locations.find(location => location.id === selectedId) ?? locations[0];
    return <section className="rush-card opening-hours">
        <h3>Öppettider</h3>
        <p>Ändra ordinarie tider och särskilda datum per lokal. Alla tider avser svensk tid.</p>
        <label>Lokal<select value={selected?.id ?? ''} onChange={event => setSelectedId(event.target.value)}>
            {locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select></label>
        {selected && <OpeningHoursEditor key={selected.id} location={selected} onSaved={onSaved} />}
    </section>;
}
