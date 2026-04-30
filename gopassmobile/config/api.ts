const API_ORIGIN = (process.env.EXPO_PUBLIC_API_ORIGIN || 'https://gopassd.onrender.com').replace(/\/$/, '');

/** Origin of the API server (no /api). Used for reCAPTCHA embed page. */
export const API_BASE_URL = API_ORIGIN;

/** Base URL for REST routes — must include `/api` (see backend server.js). */
export const API_URL = `${API_ORIGIN}/api`;
