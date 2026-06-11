import axios from 'axios';

/** Live Render backend — must match vercel.json rewrites and Vercel env. */
export const PRODUCTION_BACKEND_URL = 'https://gopassd.onrender.com';

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
 * - Local dev: EXPO_PUBLIC_API_BASE_URL or LAN IP fallback
 * - Deployed web (Vercel): same-origin so vercel.json proxies /api → Render
 * - Optional: EXPO_PUBLIC_API_BASE_URL on Vercel to call Render directly
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
  return 'http://192.168.0.247:5000';
}

export const API_BASE_URL = resolveApiBaseUrl();
export const API_URL = `${API_BASE_URL}/api`;

/** Shared client — 30s timeout for Render free-tier cold starts. */
export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30_000,
});
