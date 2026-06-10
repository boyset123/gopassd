const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

function isValidDorsuEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return EMAIL_PATTERN.test(normalized);
}

function dorsuEmailErrorMessage() {
  return 'Please enter a valid email address.';
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
  isValidDorsuEmail,
  dorsuEmailErrorMessage,
  validatePhone,
};
