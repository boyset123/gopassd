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

module.exports = {
  parseLocalDate,
  parseMeridiemTimeToDate,
  parseMeridiemTimeToMillisOfDay,
};
