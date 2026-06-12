const { parseMeridiemTimeToDate } = require('./dateTime');

/** Standard office lunch break excluded from pass-slip billable time. */
const LUNCH_START = '12:00 PM';
const LUNCH_END = '1:00 PM';

function getLunchOverlapMs(start, end, dateAnchor) {
  if (!start || !end) return 0;
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (endMs <= startMs) return 0;

  const lunchStart = parseMeridiemTimeToDate(LUNCH_START, dateAnchor);
  const lunchEnd = parseMeridiemTimeToDate(LUNCH_END, dateAnchor);
  if (!lunchStart || !lunchEnd) return 0;

  const overlapStart = Math.max(startMs, lunchStart.getTime());
  const overlapEnd = Math.min(endMs, lunchEnd.getTime());
  return Math.max(0, overlapEnd - overlapStart);
}

function getBillableDurationMs(start, end, dateAnchor) {
  if (!start || !end) return 0;
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (endMs <= startMs) return 0;
  return Math.max(0, endMs - startMs - getLunchOverlapMs(start, end, dateAnchor));
}

function getBillableDurationSeconds(start, end, dateAnchor) {
  return Math.max(0, Math.round(getBillableDurationMs(start, end, dateAnchor) / 1000));
}

function getBillableDurationMinutes(start, end, dateAnchor) {
  return getBillableDurationSeconds(start, end, dateAnchor) / 60;
}

function getSlipPlannedBillableSeconds(slip) {
  const start = parseMeridiemTimeToDate(slip.timeOut, slip.date);
  const end = parseMeridiemTimeToDate(slip.estimatedTimeBack, slip.date);
  return getBillableDurationSeconds(start, end, slip.date);
}

function getSlipPlannedBillableMinutes(slip) {
  return getSlipPlannedBillableSeconds(slip) / 60;
}

module.exports = {
  LUNCH_START,
  LUNCH_END,
  getLunchOverlapMs,
  getBillableDurationMs,
  getBillableDurationSeconds,
  getBillableDurationMinutes,
  getSlipPlannedBillableSeconds,
  getSlipPlannedBillableMinutes,
};
