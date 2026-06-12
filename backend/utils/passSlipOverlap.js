const PassSlip = require('../models/PassSlip');
const { parseMeridiemTimeToDate, isSameManilaDay } = require('./dateTime');

const ACTIVE_OVERLAP_STATUSES = ['Pending', 'Recommended', 'Approved', 'Verified'];

function timeRangesOverlap(startA, endA, startB, endB) {
  if (!startA || !endA || !startB || !endB) return false;
  const startAMs = startA.getTime();
  const endAMs = endA.getTime();
  const startBMs = startB.getTime();
  const endBMs = endB.getTime();
  if (endAMs <= startAMs || endBMs <= startBMs) return false;
  return startAMs < endBMs && startBMs < endAMs;
}

function getSlipPlannedRange(slip) {
  const start = parseMeridiemTimeToDate(slip.timeOut, slip.date);
  const end = parseMeridiemTimeToDate(slip.estimatedTimeBack, slip.date);
  if (!start || !end || end.getTime() <= start.getTime()) return null;
  return { start, end };
}

function slipsOverlapSameManilaDay(candidateDate, candidateTimeOut, candidateEtb, existingSlip) {
  if (!isSameManilaDay(candidateDate, existingSlip.date)) return false;

  const candidateStart = parseMeridiemTimeToDate(candidateTimeOut, candidateDate);
  const candidateEnd = parseMeridiemTimeToDate(candidateEtb, candidateDate);
  const existingRange = getSlipPlannedRange(existingSlip);
  if (!candidateStart || !candidateEnd || candidateEnd.getTime() <= candidateStart.getTime() || !existingRange) {
    return false;
  }

  return timeRangesOverlap(
    candidateStart,
    candidateEnd,
    existingRange.start,
    existingRange.end,
  );
}

function formatOverlapMessage(conflict) {
  return `This pass slip overlaps with an existing request on the same day (${conflict.timeOut} – ${conflict.estimatedTimeBack}).`;
}

async function findOverlappingPassSlip(employeeId, date, timeOut, estimatedTimeBack, options = {}) {
  const { excludePassSlipId } = options;

  const candidateStart = parseMeridiemTimeToDate(timeOut, date);
  const candidateEnd = parseMeridiemTimeToDate(estimatedTimeBack, date);
  if (!candidateStart || !candidateEnd || candidateEnd.getTime() <= candidateStart.getTime()) {
    return null;
  }

  const targetInstant = new Date(date);
  const dayMs = 24 * 60 * 60 * 1000;
  const fromDate = new Date(targetInstant.getTime() - 10 * dayMs);
  const toDate = new Date(targetInstant.getTime() + 10 * dayMs);

  const candidates = await PassSlip.find({
    employee: employeeId,
    status: { $in: ACTIVE_OVERLAP_STATUSES },
    date: { $gte: fromDate, $lte: toDate },
  }).select('date timeOut estimatedTimeBack status').lean();

  for (const slip of candidates) {
    if (excludePassSlipId && slip._id.toString() === String(excludePassSlipId)) continue;
    if (slipsOverlapSameManilaDay(date, timeOut, estimatedTimeBack, slip)) {
      return slip;
    }
  }

  return null;
}

module.exports = {
  ACTIVE_OVERLAP_STATUSES,
  timeRangesOverlap,
  getSlipPlannedRange,
  slipsOverlapSameManilaDay,
  formatOverlapMessage,
  findOverlappingPassSlip,
};
