/**
 * Shared API Helpers
 * 
 * This module contains API-related utilities that can be used by both
 * web and mobile frontends.
 * 
 * IMPORTANT: Do not add any UI framework dependencies here.
 * This should only contain pure JavaScript/TypeScript code.
 */



// Utan raden nedan kommer det problem på "process".
declare const process: any;

// API configuration
export const API_CONFIG = {
  // Base URL will be configured per environment
  baseUrl: process.env.API_BASE_URL || 'http://localhost:3000/api',
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

