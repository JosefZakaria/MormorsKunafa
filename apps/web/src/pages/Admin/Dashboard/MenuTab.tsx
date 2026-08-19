import { ApiError } from '@shared/api';
import type { AdminSettings } from '@shared/types';
import { adminApi } from '../../../services/api';

const DEFAULT_HERO_DESKTOP = '/images/kunafa-ashta.jpg';
const DEFAULT_HERO_MOBILE = '/images/ny-kunafa-bild.jpg';
const MAX_BYTES = 4 * 1024 * 1024;

function uploadErrorMessage(err: unknown): string {
    if (err instanceof ApiError && err.data && typeof err.data === 'object' && err.data !== null && 'error' in err.data) {
        const apiError = String((err.data as { error: string }).error);
        if (/too large/i.test(apiError)) return 'Bilden är för stor (max 4 MB).';
        if (/jpeg|png|webp|valid/i.test(apiError)) return 'Välj en JPG-, PNG- eller WebP-bild.';
    }
    return 'Kunde inte ladda upp bilden. Försök igen.';
}

function HeroSlot({
    title,
    hint,
    imageUrl,
    kind,
    variant,
    disabled,
    onUploaded,
    onError,
}: {
    title: string;
    hint: string;
    imageUrl: string;
    kind: 'hero-desktop' | 'hero-mobile';
    variant: 'desktop' | 'mobile';
    disabled: boolean;
    onUploaded: (settings: AdminSettings) => void;
    onError: (message: string) => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<string | null>(null);

    const handleFile = async (file: File | undefined) => {
        if (!file) return;
        if (file.size > MAX_BYTES) {
            onError('Bilden är för stor (max 4 MB).');
            return;
        }
        setBusy(true);
        setStatus(null);
        try {
            const result = await adminApi.uploadImage(kind, file);
            if (result.settings) onUploaded(result.settings);
            setStatus('Bilden är uppdaterad');
        } catch (err) {
            onError(uploadErrorMessage(err));
        } finally {
            setBusy(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <label className={`hero-upload-card hero-upload-card--${variant}${busy ? ' is-busy' : ''}`}>
            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                hidden
                disabled={disabled || busy}
                onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            <div className="hero-upload-card__preview">
                <img src={imageUrl} alt="" />
                {busy && <div className="hero-upload-card__overlay">Laddar upp…</div>}
            </div>
            <div className="hero-upload-card__meta">
                <strong>{title}</strong>
                <span>{hint}</span>
                {status && <em className="hero-upload-card__status">{status}</em>}
            </div>
        </label>
    );
}

export function MenuTab({
    settings,
    onSettingsChange,
    onError,
}: {
    settings: AdminSettings | null;
    onSettingsChange: (settings: AdminSettings) => void;
    onError: (message: string) => void;
}) {
    return (
        <div className="menu-tab">
            <h2 className="menu-tab__title">Startsidans bild</h2>
            <p className="menu-tab__lead">
                Tryck på en bild för att byta den. Ändringen syns direkt på startsidan.
            </p>
            {!settings ? (
                <p>Laddar…</p>
            ) : (
            <div className="hero-upload-grid">
                <HeroSlot
                    title="Dator"
                    hint="Visas på dator"
                    variant="desktop"
                    kind="hero-desktop"
                    imageUrl={settings?.heroImageDesktop || DEFAULT_HERO_DESKTOP}
                    disabled={!settings}
                    onUploaded={onSettingsChange}
                    onError={onError}
                />
                <HeroSlot
                    title="Mobil"
                    hint="Visas på telefon"
                    variant="mobile"
                    kind="hero-mobile"
                    imageUrl={settings?.heroImageMobile || DEFAULT_HERO_MOBILE}
                    disabled={!settings}
                    onUploaded={onSettingsChange}
                    onError={onError}
                />
            </div>
            )}
        </div>
    );
}
