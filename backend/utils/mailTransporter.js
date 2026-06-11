const nodemailer = require('nodemailer');

let cachedTransporter = null;

/** Same Gmail setup that worked before — service: 'gmail' + App Password. */
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
