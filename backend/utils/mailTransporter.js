const nodemailer = require('nodemailer');

let cachedTransporter = null;

/** Original Gmail config — worked on Render before recent timeout/port changes. */
function createMailTransporter() {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return cachedTransporter;
}

module.exports = {
  createMailTransporter,
};
