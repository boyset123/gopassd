const { createMailTransporter } = require('./mailTransporter');

function isRenderHost() {
  return Boolean(process.env.RENDER);
}

function hasBrevoKey() {
  return Boolean(process.env.BREVO_API_KEY && String(process.env.BREVO_API_KEY).trim());
}

function getBrevoApiKey() {
  const key = process.env.BREVO_API_KEY?.trim() || '';
  if (!key) {
    const err = new Error('BREVO_API_KEY is not set.');
    err.code = 'ENOEMAIL';
    throw err;
  }
  if (key.startsWith('xsmtpsib-')) {
    const err = new Error(
      'BREVO_API_KEY looks like an SMTP key (xsmtpsib-). Use an API v3 key (xkeysib-) from Brevo → SMTP & API → API keys tab.'
    );
    err.code = 'EBREVO_KEY_TYPE';
    throw err;
  }
  if (!key.startsWith('xkeysib-')) {
    console.warn('Email: BREVO_API_KEY does not start with xkeysib- — it may be invalid or incomplete.');
  }
  return key;
}

function hasSmtpCredentials() {
  return Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

/** Prefer Brevo on Render (SMTP ports blocked on free tier). Local dev uses Gmail SMTP. */
function getEmailProvider() {
  if (hasBrevoKey() && (isRenderHost() || !hasSmtpCredentials())) {
    return 'brevo';
  }
  if (hasSmtpCredentials()) {
    return 'smtp';
  }
  if (hasBrevoKey()) {
    return 'brevo';
  }
  return 'none';
}

function isEmailConfigured() {
  return getEmailProvider() !== 'none';
}

function parseSenderAddress(raw) {
  const value = String(raw).trim();
  const match = value.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].replace(/^["']|["']$/g, '').trim(), email: match[2].trim() };
  }
  return { name: 'GoPass DOrSU', email: value };
}

function getBrevoSender() {
  if (process.env.EMAIL_FROM?.trim()) {
    return parseSenderAddress(process.env.EMAIL_FROM);
  }
  if (process.env.EMAIL_USER?.trim()) {
    return { name: 'GoPass DOrSU', email: process.env.EMAIL_USER.trim() };
  }
  const err = new Error('EMAIL_USER is required for Brevo (must match a verified sender in Brevo).');
  err.code = 'ENOEMAIL';
  throw err;
}

function getFromAddress() {
  if (getEmailProvider() === 'brevo') {
    const sender = getBrevoSender();
    return `"${sender.name}" <${sender.email}>`;
  }
  if (process.env.EMAIL_FROM?.trim()) {
    return String(process.env.EMAIL_FROM).trim();
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
      'Render blocks Gmail SMTP on the free tier. ' +
      'Add BREVO_API_KEY and EMAIL_USER in Render → Environment, verify the sender in Brevo, then redeploy.'
    );
  }
  const message = error?.message || '';
  if (
    message.toLowerCase().includes('key not found') ||
    error?.code === 'EBREVO_KEY_TYPE'
  ) {
    return (
      'Invalid Brevo API key. In Brevo go to SMTP & API → API keys (not SMTP keys), generate a new key ' +
      '(starts with xkeysib-), add it as BREVO_API_KEY in Render → Environment, and redeploy.'
    );
  }
  if (
    message.toLowerCase().includes('sender') &&
    (message.toLowerCase().includes('not valid') ||
      message.toLowerCase().includes('not verified') ||
      message.toLowerCase().includes('not allowed'))
  ) {
    return (
      'The sender email is not verified in Brevo. Go to app.brevo.com → Senders & IP → ' +
      'verify your Gmail address, set EMAIL_USER to that address in Render, and redeploy.'
    );
  }
  return message || 'Unknown email error.';
}

async function sendViaBrevo({ to, subject, text, html }) {
  const apiKey = getBrevoApiKey();
  const sender = getBrevoSender();

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.message || body.error || `Brevo API error (${response.status})`;
    const err = new Error(message);
    err.code = 'EBREVO';
    throw err;
  }
  return { messageId: body.messageId, provider: 'brevo' };
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
    const err = new Error('Email is not configured (EMAIL_USER / EMAIL_PASS or BREVO_API_KEY).');
    err.code = 'ENOEMAIL';
    throw err;
  }
  if (provider === 'brevo') {
    return sendViaBrevo({ to, subject, text, html });
  }
  return sendViaSmtp({ to, subject, text, html });
}

function logEmailConfig() {
  const provider = getEmailProvider();
  if (provider === 'brevo') {
    const sender = getBrevoSender();
    console.log(`Email: Brevo HTTP API, from "${sender.name}" <${sender.email}>`);
    if (isRenderHost()) {
      console.log('Email: Using Brevo on Render (Gmail SMTP is blocked on free tier).');
    }
    return;
  }
  if (provider === 'smtp') {
    console.log(`Email: Gmail SMTP (${process.env.EMAIL_USER})`);
    if (isRenderHost()) {
      console.warn(
        'Email: Gmail SMTP on Render free tier will likely fail (ports 465/587 blocked). ' +
          'Add BREVO_API_KEY in Render → Environment, or upgrade to a paid instance.'
      );
    }
    return;
  }
  console.warn('Email: NOT CONFIGURED — set EMAIL_USER + EMAIL_PASS (local) or BREVO_API_KEY (Render)');
}

/** Call on server startup to confirm email transport on this host. */
async function verifyEmailOnStartup() {
  logEmailConfig();
  const provider = getEmailProvider();
  if (provider === 'brevo') {
    try {
      getBrevoApiKey();
      const response = await fetch('https://api.brevo.com/v3/account', {
        headers: { 'api-key': getBrevoApiKey(), accept: 'application/json' },
      });
      if (response.ok) {
        console.log('Email: Brevo API key verified OK.');
      } else {
        const body = await response.json().catch(() => ({}));
        console.error('Email: Brevo API key check FAILED —', body.message || response.status);
        console.error(
          'Generate a new API v3 key at app.brevo.com → SMTP & API → API keys (xkeysib-), ' +
            'not an SMTP key (xsmtpsib-). Add as BREVO_API_KEY in Render and redeploy.'
        );
      }
    } catch (error) {
      console.error('Email: Brevo startup check failed —', error.message);
    }
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
          'Email: Render free tier blocks outbound SMTP. Add BREVO_API_KEY + EMAIL_USER in Render → Environment ' +
            '(verify the Gmail sender in Brevo at app.brevo.com → Senders), then redeploy.'
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
