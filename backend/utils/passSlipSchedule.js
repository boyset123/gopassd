const { parseMeridiemTimeToDate, getManilaDateParts, serverNow } = require('./dateTime');

/**
 * Compute scheduled return instant anchored to departureTime (matches client timers).
 * Falls back to slip.date when departureTime is not set.
 */
function getScheduledReturnMoment(passSlip) {
  const anchor = passSlip.departureTime
    ? new Date(passSlip.departureTime)
    : parseMeridiemTimeToDate(passSlip.timeOut, passSlip.date);
  if (!anchor || Number.isNaN(anchor.getTime())) {
    return parseMeridiemTimeToDate(passSlip.estimatedTimeBack, passSlip.date);
  }

  const parts = getManilaDateParts(anchor);
  if (!parts) {
    return parseMeridiemTimeToDate(passSlip.estimatedTimeBack, passSlip.date);
  }

  const dateStr = `${parts.year}-${String(parts.monthIndex + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  let scheduled = parseMeridiemTimeToDate(passSlip.estimatedTimeBack, dateStr);
  if (!scheduled) return parseMeridiemTimeToDate(passSlip.estimatedTimeBack, passSlip.date);
  if (scheduled.getTime() < anchor.getTime()) {
    scheduled = new Date(scheduled.getTime() + 24 * 60 * 60 * 1000);
  }
  return scheduled;
}

/** True when the slip's scheduled departure (timeOut on date) is in the past (Manila time). */
function hasScheduledDeparturePassed(passSlip) {
  const startTime = parseMeridiemTimeToDate(passSlip.timeOut, passSlip.date);
  if (!startTime) return false;
  return startTime.getTime() < serverNow().getTime();
}

module.exports = { getScheduledReturnMoment, hasScheduledDeparturePassed };
