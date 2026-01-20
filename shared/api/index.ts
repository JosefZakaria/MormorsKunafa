/**
 * Shared API Helpers
 * 
 * This module contains API-related utilities that can be used by both
 * web and mobile frontends.
 * 
 * IMPORTANT: Do not add any UI framework dependencies here.
 * This should only contain pure JavaScript/TypeScript code.
 */

// Helper to safely get environment variables in both Vite, Expo, and Node environments
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const process: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Constants: any; // Expo Constants

const getEnvVar = (key: string, fallback: string): string => {
  // Check for Expo/React Native environment
  try {
    if (typeof Constants !== 'undefined' && Constants.expoConfig?.extra?.[key]) {
      return Constants.expoConfig.extra[key] as string;
    }
  } catch (e) {
    // Ignore if Constants is not available
  }

  // Check for Vite environment (web)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta = (import.meta as any);
  if (typeof meta !== 'undefined' && meta.env && meta.env[key]) {
    return meta.env[key] as string;
  }
  // Check for Vite environment with VITE_ prefix (common convention)
  if (typeof meta !== 'undefined' && meta.env && meta.env[`VITE_${key}`]) {
    return meta.env[`VITE_${key}`] as string;
  }

  // Check for Node.js environment
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key] as string;
    }
  } catch (e) {
    // Ignore errors if process is not defined
  }

  return fallback;
};

// API configuration - works for both web and mobile
export const API_CONFIG = {
  baseUrl: getEnvVar('API_BASE_URL', 'http://localhost:3000/api'),
  timeout: 10000,
};

// API Error class for consistent error handling across platforms
export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public data?: unknown
  ) {
    super(`API Error: ${status} ${statusText}`);
    this.name = 'ApiError';
  }
}

// Generic API request function - works for both web and mobile
export async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit & {
    token?: string;
    timeout?: number;
  }
): Promise<T> {
  const { token, timeout = API_CONFIG.timeout, ...fetchOptions } = options || {};

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };

  // Add authentication token if provided
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${API_CONFIG.baseUrl}${endpoint}`;

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle non-JSON responses
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      if (!response.ok) {
        throw new ApiError(response.status, response.statusText);
      }
      return (await response.text()) as unknown as T;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(response.status, response.statusText, data);
    }

    return data as T;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof ApiError) {
      throw error;
    }
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    
    throw error;
  }
}

// Helper to get auth token from storage (platform-agnostic)
// Each platform should implement their own storage mechanism
export async function getAuthToken(): Promise<string | null> {
  // This should be implemented per platform:
  // Web: localStorage.getItem('authToken')
  // Mobile: AsyncStorage.getItem('authToken') or SecureStore
  // For now, return null - each app should implement this
  return null;
}

// API request with automatic token injection
export async function authenticatedRequest<T>(
  endpoint: string,
  options?: RequestInit & { token?: string; timeout?: number }
): Promise<T> {
  const token = options?.token || (await getAuthToken());
  return apiRequest<T>(endpoint, { ...options, token: token || undefined });
}
