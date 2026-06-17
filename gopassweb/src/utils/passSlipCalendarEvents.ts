import {
  formatManilaDateYmd,
  getManilaDateParts,
  parseMeridiemTimeInManilaDate,
} from './manilaDate';

export type CalendarEventKind = 'pass-slip';

export interface CalendarPassSlipLike {
  _id: string;
  date: string;
  timeOut?: string;
  estimatedTimeBack?: string;
  destination?: string;
  purpose?: string;
  status: string;
  trackingNo?: string;
  employee?: {
    _id?: string;
    name?: string;
    campus?: string;
    faculty?: string;
    role?: string;
  };
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
  raw: CalendarPassSlipLike;
}

const STATUS_LEGEND: { label: string; color: string; statuses: string[] }[] = [
  { label: 'Pending / In review', color: '#011a6b', statuses: ['Pending', 'Recommended'] },
  { label: 'Approved', color: '#22c55e', statuses: ['Approved'] },
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

export function formatTimeRange(timeOut?: string, estimatedTimeBack?: string): string {
  if (timeOut && estimatedTimeBack) return `${timeOut} – ${estimatedTimeBack}`;
  if (timeOut) return timeOut;
  return '';
}

export function passSlipToCalendarEvent(slip: CalendarPassSlipLike): CalendarEvent {
  const dateYmd = formatManilaDateYmd(slip.date);
  const employeeName = slip.employee?.name?.trim() || 'Unknown Employee';
  const timeLabel = formatTimeRange(slip.timeOut, slip.estimatedTimeBack);
  return {
    id: slip._id,
    kind: 'pass-slip',
    dateYmd,
    title: employeeName,
    subtitle: slip.destination?.trim() || slip.purpose?.trim() || undefined,
    status: slip.status,
    color: getStatusCalendarColor(slip.status),
    timeLabel,
    startAt: parseMeridiemTimeInManilaDate(slip.date, slip.timeOut),
    endAt: parseMeridiemTimeInManilaDate(slip.date, slip.estimatedTimeBack),
    raw: slip,
  };
}

export function bucketPassSlipsByDay(slips: CalendarPassSlipLike[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const slip of slips) {
    const event = passSlipToCalendarEvent(slip);
    if (!event.dateYmd) continue;
    const existing = map.get(event.dateYmd) ?? [];
    existing.push(event);
    map.set(event.dateYmd, existing);
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
