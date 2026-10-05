import { API_CONFIG, ApiError } from '@shared/api';
import type { AdminSettings } from '@shared/types';

let initialRequest: Promise<AdminSettings> | null = null;
let activeRequest: Promise<AdminSettings> | null = null;
let appRequestedSettings = false;

function preloadHeroImages(settings: AdminSettings): void {
    const images = [
        [settings.heroImageDesktop, '(min-width: 969px)'],
        [settings.heroImageMobile, '(max-width: 968px)'],
    ];
    for (const [url, media] of images) {
        if (!url) continue;
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = url;
        link.media = media;
        link.fetchPriority = 'high';
        document.head.appendChild(link);
    }
}

async function fetchSettings(): Promise<AdminSettings> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_CONFIG.timeout);
    try {
        // A bodyless GET needs no Content-Type header or CORS preflight round trip.
        const response = await fetch(`${API_CONFIG.baseUrl}/orders/settings`, {
            signal: controller.signal,
            cache: 'no-store',
        });
        if (!response.ok) throw new ApiError(response.status, response.statusText);
        const settings: AdminSettings = await response.json();
        if (window.location.pathname === '/' && settings) preloadHeroImages(settings);
        return settings;
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('Request timeout');
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

function trackRequest(request: Promise<AdminSettings>): Promise<AdminSettings> {
    activeRequest = request;
    const clear = () => {
        if (activeRequest === request) activeRequest = null;
    };
    void request.then(clear, clear);
    return request;
}

export function preloadLandingSettings(): void {
    if (window.location.pathname !== '/' || initialRequest || appRequestedSettings) return;
    initialRequest = activeRequest ?? trackRequest(fetchSettings());
    // The app consumes this promise later, including when the request fails early.
    void initialRequest.catch(() => {});
}

export function getPublicSettings(): Promise<AdminSettings> {
    appRequestedSettings = true;
    if (initialRequest) {
        const request = initialRequest;
        initialRequest = null;
        return trackRequest(request);
    }
    return activeRequest ?? trackRequest(fetchSettings());
}
