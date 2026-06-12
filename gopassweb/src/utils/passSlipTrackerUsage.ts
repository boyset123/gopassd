import { parseMeridiemTimeInManilaDate } from './manilaDate';

const RETURNED_STATUSES = new Set(['Returned', 'Completed']);

export type TrackerSlipLike = {
  date: string;
  timeOut?: string;
  estimatedTimeBack?: string;
  status?: string;
  departureTime?: string;
  arrivalTime?: string;
  actualMinutesUsed?: number;
  overdueMinutes?: number;
};

export function getPlannedMinutes(slip: TrackerSlipLike): number {
  const baseDate = new Date(slip.date);
  if (Number.isNaN(baseDate.getTime())) return 0;
  const start = parseMeridiemTimeInManilaDate(baseDate, slip.timeOut);
  const end = parseMeridiemTimeInManilaDate(baseDate, slip.estimatedTimeBack);
  if (!start || !end || end.getTime() < start.getTime()) return 0;
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

export function getActualMinutes(slip: TrackerSlipLike): number {
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

export function getLateMinutes(slip: TrackerSlipLike): number {
  if (typeof slip.overdueMinutes !== 'number' || slip.overdueMinutes <= 0) return 0;
  return Math.ceil(slip.overdueMinutes);
}

/** HRP tracker usage: 0 until returned; actual when on time/early; planned+late when overdue. */
export function getTrackerUsedMinutes(slip: TrackerSlipLike): {
  usedMinutes: number;
  lateMinutes: number;
} {
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
