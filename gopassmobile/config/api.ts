const API_ORIGIN = (
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  process.env.EXPO_PUBLIC_API_ORIGIN ||
  'http://192.168.0.247:5000'
).replace(/\/$/, '');

/** Origin of the API server (no /api). Used for reCAPTCHA embed page. */
export const API_BASE_URL = API_ORIGIN;

/** Base URL for REST routes — must include `/api` (see backend server.js). */
export const API_URL = `${API_ORIGIN}/api`;
