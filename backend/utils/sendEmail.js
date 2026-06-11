const { createMailTransporter } = require('./mailTransporter');

function getEmailProvider() {
  if (process.env.RESEND_API_KEY && String(process.env.RESEND_API_KEY).trim()) {
    return 'resend';
  }
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return 'smtp';
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
    const err = new Error('Email is not configured (EMAIL_USER / EMAIL_PASS).');
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
    console.log(`Email: Resend API, from ${getFromAddress()}`);
  } else if (provider === 'smtp') {
    console.log(`Email: Gmail SMTP (${process.env.EMAIL_USER})`);
  } else {
    console.warn('Email: NOT CONFIGURED — set EMAIL_USER + EMAIL_PASS (or RESEND_API_KEY)');
  }
}

/** Call on server startup to confirm Gmail can connect on this host (Render vs local). */
async function verifyEmailOnStartup() {
  logEmailConfig();
  const provider = getEmailProvider();
  if (provider === 'smtp') {
    try {
      await createMailTransporter().verify();
      console.log('Email: Gmail SMTP connection verified OK');
    } catch (error) {
      console.error('Email: Gmail SMTP verify FAILED —', error.code, error.message);
      console.error(
        'If this is Render: copy EMAIL_USER and EMAIL_PASS from backend/.env into Render → Environment, then redeploy.'
      );
    }
  }
}

module.exports = {
  sendEmail,
  isEmailConfigured,
  getEmailProvider,
  logEmailConfig,
  verifyEmailOnStartup,
};
