import { parseMeridiemTimeInManilaDate } from './manilaDate';

/** Standard office lunch break excluded from pass-slip billable time. */
export const LUNCH_START = '12:00 PM';
export const LUNCH_END = '1:00 PM';

export function getLunchOverlapMs(start: Date, end: Date, dateAnchor: Date | string): number {
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (endMs <= startMs) return 0;

  const lunchStart = parseMeridiemTimeInManilaDate(dateAnchor, LUNCH_START);
  const lunchEnd = parseMeridiemTimeInManilaDate(dateAnchor, LUNCH_END);
  if (!lunchStart || !lunchEnd) return 0;

  const overlapStart = Math.max(startMs, lunchStart.getTime());
  const overlapEnd = Math.min(endMs, lunchEnd.getTime());
  return Math.max(0, overlapEnd - overlapStart);
}

export function getBillableDurationMs(
  start: Date,
  end: Date,
  dateAnchor: Date | string,
): number {
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (endMs <= startMs) return 0;
  return Math.max(0, endMs - startMs - getLunchOverlapMs(start, end, dateAnchor));
}

export function getBillableDurationSeconds(
  start: Date,
  end: Date,
  dateAnchor: Date | string,
): number {
  return Math.max(0, Math.round(getBillableDurationMs(start, end, dateAnchor) / 1000));
}

export function getBillableDurationMinutes(
  start: Date,
  end: Date,
  dateAnchor: Date | string,
): number {
  return getBillableDurationSeconds(start, end, dateAnchor) / 60;
}
