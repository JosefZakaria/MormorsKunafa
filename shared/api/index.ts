/**
 * Shared API Helpers
 * 
 * This module contains API-related utilities that can be used by both
 * web and mobile frontends.
 * 
 * IMPORTANT: Do not add any UI framework dependencies here.
 * This should only contain pure JavaScript/TypeScript code.
 */

// Helper to safely get environment variables in both Vite and Node environments
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const process: any;

const getEnvVar = (key: string, fallback: string): string => {
  // Check for Vite environment
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

// API configuration
export const API_CONFIG = {
  // Base URL will be configured per environment
  baseUrl: getEnvVar('API_BASE_URL', 'http://localhost:3000/api'),
  timeout: 10000,
};

// Example API helper (to be implemented):

// export async function apiRequest<T>(
//   endpoint: string,
//   options?: RequestInit
// ): Promise<T> {
//   const response = await fetch(`${API_CONFIG.baseUrl}${endpoint}`, {
//     ...options,
//     headers: {
//       'Content-Type': 'application/json',
//       ...options?.headers,
//     },
//   });
//
//   if (!response.ok) {
//     throw new Error(`API Error: ${response.status}`);
//   }
//
//   return response.json();
// }

