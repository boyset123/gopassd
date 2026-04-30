function parseLocalDate(dateValue) {
  if (!dateValue) return null;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return null;

  const match = String(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const monthIndex = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    return new Date(year, monthIndex, day, 0, 0, 0, 0);
  }

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
}

function parseMeridiemTimeToDate(timeStr, dateValue) {
  const match = String(timeStr || '').match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = (match[3] || '').toUpperCase();
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;

  const baseDate = parseLocalDate(dateValue);
  if (!baseDate) return null;

  baseDate.setHours(hours, minutes, 0, 0);
  return baseDate;
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
