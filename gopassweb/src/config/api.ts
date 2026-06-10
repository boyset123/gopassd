import axios from 'axios';

/** Render service name from render.yaml — used in vercel.json rewrites. */
export const PRODUCTION_BACKEND_URL = 'https://gopassdorsu-api.onrender.com';

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    hostname.endsWith('.local')
  );
}

function isLocalApiUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1|192\.168\./.test(url);
}

/**
 * Resolves the API origin (no /api suffix).
 * - Local dev: EXPO_PUBLIC_API_BASE_URL or localhost:5000
 * - Deployed web (Vercel): same-origin so vercel.json can proxy /api → Render backend
 * - Optional: set EXPO_PUBLIC_API_BASE_URL on Vercel to hit the backend directly
 */
export function resolveApiBaseUrl(): string {
  const envUrl =
    process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
    process.env.EXPO_PUBLIC_API_ORIGIN?.trim();

  if (typeof window !== 'undefined') {
    const { hostname, origin, protocol } = window.location;
    if (protocol === 'http:' || protocol === 'https:') {
      if (!isLocalHostname(hostname)) {
        if (envUrl && !isLocalApiUrl(envUrl)) {
          return envUrl.replace(/\/$/, '');
        }
        return origin.replace(/\/$/, '');
      }
    }
  }

  if (envUrl) return envUrl.replace(/\/$/, '');
  return 'http://localhost:5000';
}

export const API_BASE_URL = resolveApiBaseUrl();
export const API_URL = `${API_BASE_URL}/api`;

/** Shared axios client with a 10s timeout so unreachable hosts fail fast. */
export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 10_000,
});
