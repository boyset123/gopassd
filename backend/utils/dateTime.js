const MANILA_OFFSET_MINUTES = 8 * 60;

function buildManilaDate(year, monthIndex, day, hours = 0, minutes = 0) {
  const utcMs = Date.UTC(year, monthIndex, day, hours, minutes, 0, 0) - MANILA_OFFSET_MINUTES * 60 * 1000;
  return new Date(utcMs);
}

function extractDateParts(dateValue) {
  if (!dateValue) return null;

  const match = String(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return {
      year: parseInt(match[1], 10),
      monthIndex: parseInt(match[2], 10) - 1,
      day: parseInt(match[3], 10),
    };
  }

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return null;

  // Fallback for Date/ISO values while remaining timezone-stable.
  return {
    year: parsed.getUTCFullYear(),
    monthIndex: parsed.getUTCMonth(),
    day: parsed.getUTCDate(),
  };
}

function parseLocalDate(dateValue) {
  const parts = extractDateParts(dateValue);
  if (!parts) return null;
  return buildManilaDate(parts.year, parts.monthIndex, parts.day, 0, 0);
}

function parseMeridiemTimeToDate(timeStr, dateValue) {
  const match = String(timeStr || '').match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = (match[3] || '').toUpperCase();
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;

  const parts = extractDateParts(dateValue);
  if (!parts) return null;

  return buildManilaDate(parts.year, parts.monthIndex, parts.day, hours, minutes);
}

function getManilaDateParts(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [y, m, day] = fmt.format(d).split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !day) return null;
  return { year: y, monthIndex: m - 1, day };
}

/** Authoritative server clock — use instead of scattering `new Date()` in routes. */
function serverNow() {
  return new Date();
}

/** Midnight today in Asia/Manila intent. */
function getManilaTodayStart() {
  const parts = getManilaDateParts(serverNow());
  if (!parts) return null;
  return buildManilaDate(parts.year, parts.monthIndex, parts.day, 0, 0);
}

function parseMeridiemTimeToMillisOfDay(timeStr) {
  const match = String(timeStr || '').match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = (match[3] || '').toUpperCase();
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;

  return (hours * 60 + minutes) * 60 * 1000;
}

/** True when estimated return time is exactly 5:00 PM. */
function isFivePmEtb(timeStr) {
  const match = String(timeStr || '').match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return false;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = (match[3] || '').toUpperCase();
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return hours === 17 && minutes === 0;
}

function isSameManilaDay(a, b) {
  const pa = getManilaDateParts(a);
  const pb = getManilaDateParts(b);
  if (!pa || !pb) return false;
  return pa.year === pb.year && pa.monthIndex === pb.monthIndex && pa.day === pb.day;
}

module.exports = {
  parseLocalDate,
  parseMeridiemTimeToDate,
  parseMeridiemTimeToMillisOfDay,
  getManilaDateParts,
  serverNow,
  getManilaTodayStart,
  isFivePmEtb,
  isSameManilaDay,
};
