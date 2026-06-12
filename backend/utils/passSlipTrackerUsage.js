const { parseMeridiemTimeToDate } = require('./dateTime');

const RETURNED_STATUSES = new Set(['Returned', 'Completed']);

function getPlannedMinutes(slip) {
  const start = parseMeridiemTimeToDate(slip.timeOut, slip.date);
  const end = parseMeridiemTimeToDate(slip.estimatedTimeBack, slip.date);
  if (!start || !end || end.getTime() < start.getTime()) return 0;
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

function getActualMinutes(slip) {
  if (typeof slip.actualMinutesUsed === 'number' && slip.actualMinutesUsed >= 0) {
    return Math.ceil(slip.actualMinutesUsed);
  }
  if (!slip.departureTime || !slip.arrivalTime) return 0;
  const departure = new Date(slip.departureTime);
  const arrival = new Date(slip.arrivalTime);
  if (Number.isNaN(departure.getTime()) || Number.isNaN(arrival.getTime())) return 0;
  if (arrival.getTime() < departure.getTime()) return 0;
  return Math.ceil((arrival.getTime() - departure.getTime()) / 60000);
}

function getLateMinutes(slip) {
  if (typeof slip.overdueMinutes !== 'number' || slip.overdueMinutes <= 0) return 0;
  return Math.ceil(slip.overdueMinutes);
}

/**
 * HRP tracker usage: 0 until returned; actual departure→return when on time/early;
 * planned + late when overdue (matches balance adjustment rules).
 */
function getTrackerUsedMinutes(slip) {
  const status = slip.status || '';
  if (!RETURNED_STATUSES.has(status)) {
    return { usedMinutes: 0, lateMinutes: 0 };
  }

  const plannedMinutes = getPlannedMinutes(slip);
  const actualMinutes = getActualMinutes(slip);
  const lateMinutes = getLateMinutes(slip);

  if (lateMinutes > 0) {
    return {
      usedMinutes: plannedMinutes + lateMinutes,
      lateMinutes,
    };
  }

  return {
    usedMinutes: actualMinutes,
    lateMinutes: 0,
  };
}

module.exports = {
  getPlannedMinutes,
  getActualMinutes,
  getLateMinutes,
  getTrackerUsedMinutes,
};
