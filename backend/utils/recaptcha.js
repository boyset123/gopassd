/**
 * Verifies Google reCAPTCHA v2/v3 response with https://www.google.com/recaptcha/api/siteverify
 * Set RECAPTCHA_SECRET_KEY in backend/.env for production. If unset, verification is skipped (dev only).
 */
async function verifyRecaptchaResponse(token, remoteip) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret || String(secret).trim() === '') {
    if (!global._recaptchaSkipWarned) {
      console.warn('[reCAPTCHA] RECAPTCHA_SECRET_KEY is not set; verification is disabled.');
      global._recaptchaSkipWarned = true;
    }
    return { ok: true, skipped: true };
  }

  if (!token || typeof token !== 'string') {
    return { ok: false, message: 'Please complete the CAPTCHA verification.' };
  }

  const params = new URLSearchParams();
  params.append('secret', secret);
  params.append('response', token);
  if (remoteip) {
    params.append('remoteip', remoteip);
  }

  const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await res.json();
  if (!data.success) {
    return { ok: false, message: 'CAPTCHA verification failed. Please try again.' };
  }

  return { ok: true };
}

module.exports = { verifyRecaptchaResponse };
