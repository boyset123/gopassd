const DEFAULT_ALLOWED_DOMAINS = ['@dorsu.edu.ph'];

function getAllowedDomains() {
  const env = process.env.ALLOWED_EMAIL_DOMAINS;
  if (env && String(env).trim()) {
    return String(env)
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
  }
  return DEFAULT_ALLOWED_DOMAINS;
}

function isValidDorsuEmail(email, { allowLegacy = false } = {}) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    return false;
  }
  if (allowLegacy && normalized.endsWith('@dorsu')) {
    return true;
  }
  const domains = getAllowedDomains();
  return domains.some((domain) => normalized.endsWith(domain.toLowerCase()));
}

function dorsuEmailErrorMessage() {
  const domains = getAllowedDomains().join(', ');
  return `Email must use an official DOrSU address (${domains}).`;
}

function validatePhone(phone) {
  const normalized = String(phone || '').trim();
  if (!normalized) {
    return { valid: false, message: 'Phone number is required.' };
  }
  const digits = normalized.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) {
    return { valid: false, message: 'Phone number must be 10–13 digits.' };
  }
  return { valid: true, normalized };
}

module.exports = {
  getAllowedDomains,
  isValidDorsuEmail,
  dorsuEmailErrorMessage,
  validatePhone,
};
