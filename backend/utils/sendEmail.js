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
  return { messageId: info.messageId, provider: 'smtp' };
}

/**
 * Send email via Resend HTTP API (optional) or Gmail SMTP (original working setup).
 */
async function sendEmail({ to, subject, text, html }) {
  const provider = getEmailProvider();
  if (provider === 'none') {
    const err = new Error('Email is not configured. Set RESEND_API_KEY on Render or EMAIL_USER/EMAIL_PASS locally.');
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
    console.log('Email config: Resend API (HTTP) — recommended for Render');
    console.log(`Email from: ${getFromAddress()}`);
  } else if (provider === 'smtp') {
    console.log(`Email config: Gmail SMTP (${process.env.EMAIL_USER})`);
  } else {
    console.log('Email config: NOT LOADED — set RESEND_API_KEY on Render or EMAIL_USER/EMAIL_PASS locally');
  }
}

module.exports = {
  sendEmail,
  isEmailConfigured,
  getEmailProvider,
  logEmailConfig,
};
