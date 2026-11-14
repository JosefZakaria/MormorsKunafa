import type { RealtimeClient } from '@supabase/realtime-js';
import { adminApi, type AdminRealtimeAccess } from './api';

const RETRY_MS = 60_000;
// The backend token lives 15 minutes; renew it with margin for a sleeping tablet.
const RENEW_BEFORE_MS = 5 * 60_000;

/**
 * Listens on the private order-signal channel. The signal carries no data: onSignal should refetch
 * through the API. onLive reports whether the channel is joined, so callers can poll faster when it is not.
 */
export function connectAdminOrderSignals(onSignal: () => void, onLive: (live: boolean) => void): () => void {
    let stopped = false;
    let client: RealtimeClient | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let access: AdminRealtimeAccess | null = null;
    let expiresAt = 0;

    const fetchToken = async (): Promise<string> => {
        access = await adminApi.getRealtimeToken();
        expiresAt = Date.now() + access.expiresIn * 1000;
        return access.token;
    };

    const start = async () => {
        try {
            await fetchToken();
        } catch (error) {
            // 503 means the server has no Realtime secret yet; polling keeps orders flowing meanwhile.
            console.warn('[realtime] token unavailable, retrying in 60 s', error);
            if (!stopped) retryTimer = setTimeout(() => void start(), RETRY_MS);
            return;
        }
        // Loaded here so customer pages never download the Realtime client.
        const { RealtimeClient } = await import('@supabase/realtime-js');
        if (stopped || !access) return;
        const { url, apiKey, topic } = access;
        client = new RealtimeClient(`${url.replace(/\/+$/, '')}/realtime/v1`, {
            params: { apikey: apiKey },
            // Called on connect and every heartbeat; a failed renewal keeps the cached token.
            accessToken: async () => (expiresAt - Date.now() < RENEW_BEFORE_MS ? fetchToken() : access!.token),
        });
        client.channel(topic, { config: { private: true } })
            .on('broadcast', { event: 'orders_changed' }, () => onSignal())
            .subscribe((status) => {
                if (stopped) return;
                onLive(status === 'SUBSCRIBED');
                // Joins and rejoins refetch, so nothing missed while disconnected stays hidden.
                if (status === 'SUBSCRIBED') onSignal();
            });
    };

    void start();
    return () => {
        stopped = true;
        clearTimeout(retryTimer);
        if (client) {
            void client.removeAllChannels();
            client.disconnect();
        }
    };
}
