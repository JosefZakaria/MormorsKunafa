import type { AdminSettings } from '@shared/types';
import { getPublicSettings } from './publicSettings';

/** Refresh open customer pages and pick up saves in other dashboard tabs. */
export function watchPublicSettings(onSettings: (settings: AdminSettings) => void, onError: (error: unknown) => void) {
    let disposed = false;
    let previous = '';
    const refresh = () => {
        if (document.visibilityState === 'hidden') return;
        void getPublicSettings().then(settings => {
            const serialized = JSON.stringify(settings);
            if (!disposed && serialized !== previous) {
                previous = serialized;
                onSettings(settings);
            }
        }).catch(error => { if (!disposed) onError(error); });
    };
    const storageChanged = (event: StorageEvent) => {
        if (event.key === 'opening-hours-updated') refresh();
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', storageChanged);
    document.addEventListener('visibilitychange', refresh);
    return () => {
        disposed = true;
        window.clearInterval(timer);
        window.removeEventListener('focus', refresh);
        window.removeEventListener('storage', storageChanged);
        document.removeEventListener('visibilitychange', refresh);
    };
}
