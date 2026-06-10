export type RemainingTime = {
  hours: number;
  minutes: number;
  seconds: number;
  isOverdue: boolean;
};

function parseMeridiemTime(timeStr: string): { hours: number; minutes: number } | null {
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return { hours, minutes };
}

export function getPassSlipDeadlineMs(departureTime: string, estimatedTimeBack: string): number | null {
  if (!estimatedTimeBack || !departureTime) return null;
  const departureDate = new Date(departureTime);
  if (Number.isNaN(departureDate.getTime())) return null;
  const etbParts = parseMeridiemTime(estimatedTimeBack);
  if (!etbParts) return null;
  const etbDate = new Date(departureDate.getTime());
  etbDate.setHours(etbParts.hours, etbParts.minutes, 0, 0);
  if (etbDate.getTime() < departureDate.getTime()) {
    etbDate.setDate(etbDate.getDate() + 1);
  }
  return etbDate.getTime();
}

export function computeRemainingTime(deadlineMs: number, nowMs: number): RemainingTime {
  const diff = deadlineMs - nowMs;
  const isOverdue = diff <= 0;
  const absDiff = Math.abs(diff);
  return {
    hours: Math.floor(absDiff / (1000 * 60 * 60)),
    minutes: Math.floor((absDiff / 1000 / 60) % 60),
    seconds: Math.floor((absDiff / 1000) % 60),
    isOverdue,
  };
}

export function computePassSlipRemaining(
  departureTime: string,
  estimatedTimeBack: string,
  nowMs: number,
): RemainingTime {
  const deadline = getPassSlipDeadlineMs(departureTime, estimatedTimeBack);
  if (deadline == null) {
    return { hours: 0, minutes: 0, seconds: 0, isOverdue: true };
  }
  return computeRemainingTime(deadline, nowMs);
}
