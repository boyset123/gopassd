const { parseMeridiemTimeToDate } = require('./dateTime');
const { getScheduledReturnMoment } = require('./passSlipSchedule');
const { getBillableDurationSeconds } = require('./passSlipDuration');
const { formatPassSlipBalance } = require('./formatPassSlipBalance');

/**
 * Compute balance adjustment when a verified pass slip is returned.
 * HR approval already reserved planned minutes; this credits unused time on early
 * return and deducts overdue minutes when the employee is late.
 *
 * @returns {{ adjustment: number, actualMinutes: number, plannedMinutes: number, overdueMinutes: number }}
 *   adjustment is in seconds (credits unused planned time, debits overdue time).
 */
function computeReturnBalanceAdjustment(passSlip, arrivalTime) {
  const start = parseMeridiemTimeToDate(passSlip.timeOut, passSlip.date);
  const end = parseMeridiemTimeToDate(passSlip.estimatedTimeBack, passSlip.date);

  let plannedSeconds = 0;
  let plannedMinutes = 0;
  if (start && end && end.getTime() >= start.getTime()) {
    plannedSeconds = getBillableDurationSeconds(start, end, passSlip.date);
    plannedMinutes = Math.round(plannedSeconds / 60);
  }

  const departureTime = passSlip.departureTime ? new Date(passSlip.departureTime) : null;
  const arrival = arrivalTime instanceof Date ? arrivalTime : new Date(arrivalTime);

  let actualSeconds = 0;
  let actualMinutes = 0;
  if (
    departureTime &&
    !Number.isNaN(departureTime.getTime()) &&
    !Number.isNaN(arrival.getTime()) &&
    arrival.getTime() >= departureTime.getTime()
  ) {
    actualSeconds = getBillableDurationSeconds(departureTime, arrival, passSlip.date);
    actualMinutes = Math.ceil(actualSeconds / 60);
  }

  let adjustment = 0;
  if (plannedSeconds > 0 && actualSeconds < plannedSeconds) {
    adjustment += plannedSeconds - actualSeconds;
  }

  let overdueMinutes = 0;
  const scheduledReturn = getScheduledReturnMoment(passSlip);
  if (scheduledReturn && !Number.isNaN(arrival.getTime())) {
    const diffMs = arrival.getTime() - scheduledReturn.getTime();
    if (diffMs > 0) {
      overdueMinutes = diffMs / 60000;
      adjustment -= Math.ceil(diffMs / 1000);
    }
  }

  return { adjustment, actualMinutes, plannedMinutes, overdueMinutes };
}

/** Human-readable audit details for a return scan (duration + balance credit/debit). */
function formatReturnAuditDetails(actualMinutes, adjustmentSeconds) {
  const parts = [];
  if (actualMinutes != null) {
    parts.push(`Duration: ${actualMinutes} min`);
  }
  if (adjustmentSeconds > 0) {
    parts.push(`Balance credited: ${formatPassSlipBalance(adjustmentSeconds)}`);
  } else if (adjustmentSeconds < 0) {
    parts.push(`Balance deducted: ${formatPassSlipBalance(-adjustmentSeconds)}`);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

module.exports = {
  computeReturnBalanceAdjustment,
  formatReturnAuditDetails,
};
