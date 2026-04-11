// Google reCAPTCHA v2 site key (public). Set EXPO_PUBLIC_RECAPTCHA_SITE_KEY in .env at project root.
// Mobile WebView loads /recaptcha-embed from API_BASE_URL — add that API hostname (e.g. 192.168.x.x) in Google reCAPTCHA admin domains.
export const RECAPTCHA_SITE_KEY = process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY ?? '';
