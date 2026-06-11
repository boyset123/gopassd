const { createMailTransporter } = require('./mailTransporter');

function isRenderHost() {
  return Boolean(process.env.RENDER);
}

function hasResendKey() {
  return Boolean(process.env.RESEND_API_KEY && String(process.env.RESEND_API_KEY).trim());
}

function hasSmtpCredentials() {
  return Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

/** Prefer Resend on Render (SMTP ports blocked on free tier). Local dev uses Gmail SMTP. */
function getEmailProvider() {
  if (hasResendKey() && (isRenderHost() || !hasSmtpCredentials())) {
    return 'resend';
  }
  if (hasSmtpCredentials()) {
    return 'smtp';
  }
  if (hasResendKey()) {
    return 'resend';
  }
  return 'none';
}

function isEmailConfigured() {
  return getEmailProvider() !== 'none';
}

function getFromAddress() {
  if (process.env.EMAIL_FROM && String(process.env.EMAIL_FROM).trim()) {
    return String(process.env.EMAIL_FROM).trim();
  }
  if (getEmailProvider() === 'resend') {
    return 'GoPass DOrSU <onboarding@resend.dev>';
  }
  return `"GoPass DOrSU" <${process.env.EMAIL_USER}>`;
}

function isSmtpBlockedError(error) {
  const code = error?.code || '';
  return code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'ESOCKET';
}

function formatEmailErrorForClient(error) {
  if (isSmtpBlockedError(error) && isRenderHost()) {
    return (
      'Render blocks Gmail SMTP on the free tier (ports 465/587). ' +
      'Add RESEND_API_KEY in Render → Environment and redeploy, or upgrade to a paid Render instance.'
    );
  }
  return error?.message || 'Unknown email error.';
}

async function sendViaResend({ to, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY.trim();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: getFromAddress(),
      to: [to],
      subject,
      text,
      html,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.message || body.error || `Resend API error (${response.status})`;
    const err = new Error(message);
    err.code = 'ERESEND';
    throw err;
  }
  return { messageId: body.id, provider: 'resend' };
}

async function sendViaSmtp({ to, subject, text, html }) {
  const transporter = createMailTransporter();
  const info = await transporter.sendMail({
    from: getFromAddress(),
    to,
    subject,
    text,
    html,
  });
  return { messageId: info.messageId, provider: 'gmail' };
}

async function sendEmail({ to, subject, text, html }) {
  const provider = getEmailProvider();
  if (provider === 'none') {
    const err = new Error('Email is not configured (EMAIL_USER / EMAIL_PASS or RESEND_API_KEY).');
    err.code = 'ENOEMAIL';
    throw err;
  }
  if (provider === 'resend') {
    return sendViaResend({ to, subject, text, html });
  }
  return sendViaSmtp({ to, subject, text, html });
}

function logEmailConfig() {
  const provider = getEmailProvider();
  if (provider === 'resend') {
    console.log(`Email: Resend HTTP API, from ${getFromAddress()}`);
    if (isRenderHost()) {
      console.log('Email: Using Resend on Render (Gmail SMTP is blocked on free tier).');
    }
    return;
  }
  if (provider === 'smtp') {
    console.log(`Email: Gmail SMTP (${process.env.EMAIL_USER})`);
    if (isRenderHost()) {
      console.warn(
        'Email: Gmail SMTP on Render free tier will likely fail (ports 465/587 blocked). ' +
          'Add RESEND_API_KEY in Render → Environment, or upgrade to a paid instance.'
      );
    }
    return;
  }
  console.warn('Email: NOT CONFIGURED — set EMAIL_USER + EMAIL_PASS (local) or RESEND_API_KEY (Render)');
}

/** Call on server startup to confirm email transport on this host. */
async function verifyEmailOnStartup() {
  logEmailConfig();
  const provider = getEmailProvider();
  if (provider === 'resend') {
    console.log('Email: Resend API ready (HTTPS — works on Render).');
    return;
  }
  if (provider === 'smtp') {
    try {
      await createMailTransporter().verify();
      console.log('Email: Gmail SMTP connection verified OK');
    } catch (error) {
      console.error('Email: Gmail SMTP verify FAILED —', error.code, error.message);
      if (isRenderHost() && isSmtpBlockedError(error)) {
        console.error(
          'Email: Render free tier blocks outbound SMTP. Your EMAIL_USER / EMAIL_PASS are loaded correctly, ' +
            'but the server cannot reach smtp.gmail.com. Fix: add RESEND_API_KEY in Render → Environment ' +
            '(free at resend.com), or upgrade to a paid Render instance to restore Gmail SMTP.'
        );
      }
    }
  }
}

module.exports = {
  sendEmail,
  isEmailConfigured,
  getEmailProvider,
  logEmailConfig,
  verifyEmailOnStartup,
  formatEmailErrorForClient,
  isSmtpBlockedError,
};
