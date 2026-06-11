const { parseMeridiemTimeToDate } = require('./dateTime');
const { getScheduledReturnMoment } = require('./passSlipSchedule');

/**
 * Compute balance adjustment when a verified pass slip is returned.
 * HR approval already reserved planned minutes; this credits unused time on early
 * return and deducts overdue minutes when the employee is late.
 *
 * @returns {{ adjustment: number, actualMinutes: number, plannedMinutes: number, overdueMinutes: number }}
 */
function computeReturnBalanceAdjustment(passSlip, arrivalTime) {
  const start = parseMeridiemTimeToDate(passSlip.timeOut, passSlip.date);
  const end = parseMeridiemTimeToDate(passSlip.estimatedTimeBack, passSlip.date);

  let plannedMinutes = 0;
  if (start && end && end.getTime() >= start.getTime()) {
    plannedMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  }

  const departureTime = passSlip.departureTime ? new Date(passSlip.departureTime) : null;
  const arrival = arrivalTime instanceof Date ? arrivalTime : new Date(arrivalTime);

  let actualMinutes = 0;
  if (
    departureTime &&
    !Number.isNaN(departureTime.getTime()) &&
    !Number.isNaN(arrival.getTime()) &&
    arrival.getTime() >= departureTime.getTime()
  ) {
    actualMinutes = Math.ceil((arrival.getTime() - departureTime.getTime()) / 60000);
  }

  let adjustment = 0;
  if (plannedMinutes > 0 && actualMinutes < plannedMinutes) {
    adjustment += plannedMinutes - actualMinutes;
  }

  let overdueMinutes = 0;
  const scheduledReturn = getScheduledReturnMoment(passSlip);
  if (scheduledReturn && !Number.isNaN(arrival.getTime())) {
    const diffMs = arrival.getTime() - scheduledReturn.getTime();
    if (diffMs > 0) {
      overdueMinutes = diffMs / 60000;
      adjustment -= Math.ceil(overdueMinutes);
    }
  }

  return { adjustment, actualMinutes, plannedMinutes, overdueMinutes };
}

module.exports = { computeReturnBalanceAdjustment };
