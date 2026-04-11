// Google reCAPTCHA v2 site key (public). Set EXPO_PUBLIC_RECAPTCHA_SITE_KEY in .env at project root.
// WebView loads /recaptcha-embed from API_BASE_URL — add that API hostname in Google reCAPTCHA admin domains.
export const RECAPTCHA_SITE_KEY = process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY ?? '';
