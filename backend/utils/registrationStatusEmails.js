const { sendEmail, isEmailConfigured } = require('./sendEmail');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmailShell({ preheader, title, bodyHtml }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f7fb;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#111827;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${escapeHtml(preheader)}
    </div>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f5f7fb;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="width:100%;max-width:600px;">
            <tr>
              <td style="padding:6px 8px 16px 8px;">
                <div style="font-size:14px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">
                  GoPass DOrSU
                </div>
                <div style="font-size:22px;font-weight:700;color:#111827;line-height:1.25;margin-top:6px;">
                  ${escapeHtml(title)}
                </div>
              </td>
            </tr>

            <tr>
              <td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:18px 18px 14px 18px;box-shadow:0 6px 18px rgba(17,24,39,0.06);">
                ${bodyHtml}
              </td>
            </tr>

            <tr>
              <td style="padding:14px 8px 0 8px;">
                <div style="font-size:12px;line-height:1.6;color:#6b7280;">
                  This is an automated message from GoPass DOrSU.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildRegistrationApprovedEmailContent({ name, email }) {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);

  const text =
    `Hello ${name},\n\n` +
    `Your GoPass DOrSU registration has been approved by Human Resources.\n\n` +
    `You may now log in with the email and password you used when you registered:\n` +
    `Email: ${email}`;

  const html = buildEmailShell({
    preheader: 'Your GoPass DOrSU account has been approved.',
    title: 'Your account has been approved',
    bodyHtml: `
      <div style="font-size:15px;line-height:1.6;color:#111827;">
        Hello ${safeName},<br/>
        Your registration has been approved by Human Resources. You may now log in with the email and password you used when you registered.
      </div>

      <div style="height:14px;line-height:14px;">&nbsp;</div>

      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;">
        <tr>
          <td style="padding:14px;">
            <div style="font-size:12px;color:#166534;text-transform:uppercase;letter-spacing:0.06em;">Status</div>
            <div style="font-size:16px;font-weight:600;color:#14532d;">Approved</div>
            <div style="font-size:13px;color:#166534;margin-top:8px;">
              Registered email: <strong>${safeEmail}</strong>
            </div>
          </td>
        </tr>
      </table>
    `,
  });

  return {
    subject: 'Your GoPass DOrSU account has been approved',
    text,
    html,
  };
}

function buildRegistrationRejectedEmailContent({ name, email, reason }) {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeReason = escapeHtml(reason);

  const text =
    `Hello ${name},\n\n` +
    `Your GoPass DOrSU registration was not approved.\n\n` +
    `Registered email: ${email}\n` +
    `Reason: ${reason}\n\n` +
    `If you believe this was a mistake, please contact your campus Human Resources office.`;

  const html = buildEmailShell({
    preheader: 'Your GoPass DOrSU registration was not approved.',
    title: 'Your registration was not approved',
    bodyHtml: `
      <div style="font-size:15px;line-height:1.6;color:#111827;">
        Hello ${safeName},<br/>
        Human Resources reviewed your registration and it was not approved at this time.
      </div>

      <div style="height:14px;line-height:14px;">&nbsp;</div>

      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;">
        <tr>
          <td style="padding:14px;">
            <div style="font-size:12px;color:#991b1b;text-transform:uppercase;letter-spacing:0.06em;">Status</div>
            <div style="font-size:16px;font-weight:600;color:#7f1d1d;">Not approved</div>
            <div style="font-size:13px;color:#991b1b;margin-top:8px;">
              Registered email: <strong>${safeEmail}</strong>
            </div>
          </td>
        </tr>
      </table>

      <div style="height:14px;line-height:14px;">&nbsp;</div>

      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;">
        <tr>
          <td style="padding:14px;">
            <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;">Reason</div>
            <div style="font-size:15px;line-height:1.6;color:#111827;">${safeReason}</div>
          </td>
        </tr>
      </table>

      <div style="height:16px;line-height:16px;">&nbsp;</div>

      <div style="font-size:13px;line-height:1.6;color:#374151;">
        If you believe this was a mistake, please contact your campus Human Resources office.
      </div>
    `,
  });

  return {
    subject: 'Your GoPass DOrSU registration was not approved',
    text,
    html,
  };
}

async function sendRegistrationDecisionEmail({ user, decision, reason }) {
  if (!user?.email) return;

  if (!isEmailConfigured()) {
    console.warn(`Registration ${decision} email skipped: email not configured.`);
    return;
  }

  const content =
    decision === 'approved'
      ? buildRegistrationApprovedEmailContent({ name: user.name, email: user.email })
      : buildRegistrationRejectedEmailContent({
          name: user.name,
          email: user.email,
          reason: reason || 'Your registration was not approved.',
        });

  try {
    const mailInfo = await sendEmail({
      to: user.email,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
    console.log(`Registration ${decision} email sent to ${user.email}`, mailInfo.provider, mailInfo.messageId);
  } catch (error) {
    console.error(`Registration ${decision} email failed for ${user.email}:`, error);
  }
}

module.exports = {
  buildRegistrationApprovedEmailContent,
  buildRegistrationRejectedEmailContent,
  sendRegistrationDecisionEmail,
};
