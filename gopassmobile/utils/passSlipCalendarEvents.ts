import {
  addDaysToYmd,
  formatManilaDateYmd,
  getManilaDateParts,
  parseMeridiemTimeInManilaDate,
} from './manilaDate';

export type CalendarEventKind = 'pass-slip' | 'travel-order';

export interface CalendarSubmissionLike {
  _id: string;
  type: 'Pass Slip' | 'Travel Order';
  date?: string;
  status: string;
  destination?: string;
  to?: string;
  purpose?: string;
  timeOut?: string;
  estimatedTimeBack?: string;
  departureDate?: string;
  arrivalDate?: string;
  travelType?: string;
}

export interface CalendarEvent {
  id: string;
  kind: CalendarEventKind;
  dateYmd: string;
  title: string;
  subtitle?: string;
  status: string;
  color: string;
  timeLabel: string;
  startAt: Date | null;
  endAt: Date | null;
  raw: CalendarSubmissionLike;
}

const STATUS_LEGEND: { label: string; color: string; statuses: string[] }[] = [
  { label: 'Pending / In review', color: '#011a6b', statuses: ['Pending', 'Recommended', 'For HR Approval', 'For President Approval'] },
  { label: 'Approved', color: '#22c55e', statuses: ['Approved', 'President Approved'] },
  { label: 'Active / Verified', color: '#0ea5e9', statuses: ['Verified'] },
  { label: 'Returned / Completed', color: '#6366f1', statuses: ['Returned', 'Completed'] },
  { label: 'Rejected / Cancelled', color: '#dc3545', statuses: ['Rejected', 'Cancelled'] },
  { label: 'Expired', color: '#fece00', statuses: ['Expired'] },
];

export function getStatusCalendarColor(status: string): string {
  const match = STATUS_LEGEND.find((entry) => entry.statuses.includes(status));
  return match?.color ?? '#011a6b';
}

export function getCalendarStatusLegend() {
  return STATUS_LEGEND;
}

function formatTimeRange(timeOut?: string, estimatedTimeBack?: string): string {
  if (timeOut && estimatedTimeBack) return `${timeOut} – ${estimatedTimeBack}`;
  if (timeOut) return timeOut;
  return '';
}

function enumerateYmdRange(fromYmd: string, toYmd: string): string[] {
  if (!fromYmd || !toYmd) return [];
  const days: string[] = [];
  let cursor = fromYmd;
  let guard = 0;
  while (cursor <= toYmd && guard < 400) {
    days.push(cursor);
    cursor = addDaysToYmd(cursor, 1);
    guard += 1;
  }
  return days;
}

export function submissionToCalendarEvents(submission: CalendarSubmissionLike): CalendarEvent[] {
  if (submission.type === 'Pass Slip') {
    if (!submission.date) return [];
    const dateYmd = formatManilaDateYmd(submission.date);
    const timeLabel = formatTimeRange(submission.timeOut, submission.estimatedTimeBack);
    return [{
      id: submission._id,
      kind: 'pass-slip',
      dateYmd,
      title: 'Pass Slip',
      subtitle: submission.destination?.trim() || submission.purpose?.trim() || undefined,
      status: submission.status,
      color: getStatusCalendarColor(submission.status),
      timeLabel,
      startAt: parseMeridiemTimeInManilaDate(submission.date, submission.timeOut),
      endAt: parseMeridiemTimeInManilaDate(submission.date, submission.estimatedTimeBack),
      raw: submission,
    }];
  }

  const fromYmd = formatManilaDateYmd(submission.departureDate || submission.date || '');
  const toYmd = formatManilaDateYmd(submission.arrivalDate || submission.departureDate || submission.date || '');
  if (!fromYmd || !toYmd) return [];

  const travelLabel = submission.travelType === 'OT' && submission.timeOut
    ? `${fromYmd === toYmd ? fromYmd : `${fromYmd} – ${toYmd}`} · ${submission.timeOut}`
    : fromYmd === toYmd ? 'All day' : `${fromYmd} – ${toYmd}`;

  return enumerateYmdRange(fromYmd, toYmd).map((dateYmd) => ({
    id: `${submission._id}-${dateYmd}`,
    kind: 'travel-order' as const,
    dateYmd,
    title: 'Travel Order',
    subtitle: submission.to?.trim() || submission.purpose?.trim() || undefined,
    status: submission.status,
    color: getStatusCalendarColor(submission.status),
    timeLabel: travelLabel,
    startAt: submission.departureDate ? new Date(submission.departureDate) : null,
    endAt: submission.arrivalDate ? new Date(submission.arrivalDate) : null,
    raw: submission,
  }));
}

export function bucketSubmissionsByDay(submissions: CalendarSubmissionLike[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const submission of submissions) {
    for (const event of submissionToCalendarEvents(submission)) {
      const existing = map.get(event.dateYmd) ?? [];
      existing.push(event);
      map.set(event.dateYmd, existing);
    }
  }
  for (const [, events] of map) {
    events.sort((a, b) => {
      const aTime = a.startAt?.getTime() ?? 0;
      const bTime = b.startAt?.getTime() ?? 0;
      return aTime - bTime;
    });
  }
  return map;
}

export function buildMonthGrid(year: number, monthIndex: number): (string | null)[][] {
  const firstOfMonth = new Date(Date.UTC(year, monthIndex, 1));
  const startDow = firstOfMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

export function getTodayYmd(): string {
  return formatManilaDateYmd(new Date());
}

export function getManilaMonthFromDate(value: Date): { year: number; monthIndex: number } {
  const parts = getManilaDateParts(value);
  if (!parts) {
    const now = new Date();
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  }
  return { year: parts.year, monthIndex: parts.monthIndex };
}
