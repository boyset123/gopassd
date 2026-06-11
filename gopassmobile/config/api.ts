/** Live Render backend (same as Vercel EXPO_PUBLIC_API_BASE_URL). */
export const PRODUCTION_BACKEND_URL = 'https://gopassd.onrender.com';

const API_ORIGIN = (
  process.env.EXPO_PUBLIC_API_ORIGIN ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  'http://192.168.0.247:5000'
).replace(/\/$/, '');

/** Origin of the API server (no /api). Used for profile images, reCAPTCHA embed, etc. */
export const API_BASE_URL = API_ORIGIN;

/** Base URL for REST routes — must include `/api` (see backend server.js). */
export const API_URL = `${API_ORIGIN}/api`;
