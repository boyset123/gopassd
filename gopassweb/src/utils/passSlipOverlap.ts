import { getManilaDateParts, parseMeridiemTimeInManilaDate } from './manilaDate';

export const ACTIVE_OVERLAP_STATUSES = ['Pending', 'Recommended', 'Approved', 'Verified'] as const;

export type OverlapSlipLike = {
  _id?: string;
  date?: string | Date;
  timeOut?: string;
  estimatedTimeBack?: string;
  status?: string;
};

function isSameManilaDay(a: Date | string, b: Date | string): boolean {
  const pa = getManilaDateParts(a);
  const pb = getManilaDateParts(b);
  if (!pa || !pb) return false;
  return pa.year === pb.year && pa.monthIndex === pb.monthIndex && pa.day === pb.day;
}

export function timeRangesOverlap(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  const startAMs = startA.getTime();
  const endAMs = endA.getTime();
  const startBMs = startB.getTime();
  const endBMs = endB.getTime();
  if (endAMs <= startAMs || endBMs <= startBMs) return false;
  return startAMs < endBMs && startBMs < endAMs;
}

function getSlipPlannedRange(slip: OverlapSlipLike): { start: Date; end: Date } | null {
  if (!slip.date || !slip.timeOut || !slip.estimatedTimeBack) return null;
  const start = parseMeridiemTimeInManilaDate(slip.date, slip.timeOut);
  const end = parseMeridiemTimeInManilaDate(slip.date, slip.estimatedTimeBack);
  if (!start || !end || end.getTime() <= start.getTime()) return null;
  return { start, end };
}

export function slipsOverlapSameManilaDay(
  candidateDate: Date | string,
  candidateTimeOut: string,
  candidateEtb: string,
  existingSlip: OverlapSlipLike,
): boolean {
  if (!existingSlip.date || !isSameManilaDay(candidateDate, existingSlip.date)) {
    return false;
  }

  const candidateStart = parseMeridiemTimeInManilaDate(candidateDate, candidateTimeOut);
  const candidateEnd = parseMeridiemTimeInManilaDate(candidateDate, candidateEtb);
  const existingRange = getSlipPlannedRange(existingSlip);
  if (!candidateStart || !candidateEnd || !existingRange) return false;

  return timeRangesOverlap(
    candidateStart,
    candidateEnd,
    existingRange.start,
    existingRange.end,
  );
}

export function formatOverlapMessage(
  conflict: Pick<OverlapSlipLike, 'timeOut' | 'estimatedTimeBack'>,
): string {
  return `This pass slip overlaps with an existing request on the same day (${conflict.timeOut} – ${conflict.estimatedTimeBack}).`;
}

export function findOverlappingSlipInList(
  slips: OverlapSlipLike[],
  date: Date | string,
  timeOut: string,
  estimatedTimeBack: string,
  excludeSlipId?: string,
): OverlapSlipLike | null {
  for (const slip of slips) {
    if (!slip.status || !ACTIVE_OVERLAP_STATUSES.includes(slip.status as (typeof ACTIVE_OVERLAP_STATUSES)[number])) {
      continue;
    }
    if (excludeSlipId && slip._id && String(slip._id) === String(excludeSlipId)) continue;
    if (slipsOverlapSameManilaDay(date, timeOut, estimatedTimeBack, slip)) {
      return slip;
    }
  }
  return null;
}
