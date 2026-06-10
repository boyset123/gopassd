const MANILA_OFFSET_MINUTES = 8 * 60;

function buildManilaDate(year: number, monthIndex: number, day: number, hours = 0, minutes = 0): Date {
  const utcMs = Date.UTC(year, monthIndex, day, hours, minutes, 0, 0) - MANILA_OFFSET_MINUTES * 60 * 1000;
  return new Date(utcMs);
}

export function getManilaDateParts(value: Date | string): { year: number; monthIndex: number; day: number } | null {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [y, m, day] = fmt.format(d).split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !day) return null;
  return { year: y, monthIndex: m - 1, day };
}

export function getManilaWeekInfo(value: Date | string): { dayOfWeek: number; weekKey: string } | null {
  const parts = getManilaDateParts(value);
  if (!parts) return null;
  const utcDay = new Date(Date.UTC(parts.year, parts.monthIndex, parts.day));
  const dow = utcDay.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(utcDay.getTime());
  monday.setUTCDate(utcDay.getUTCDate() + diff);
  const weekKey = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;
  return { dayOfWeek: dow, weekKey };
}

export function getManilaWeekKey(value: Date | string): string {
  return getManilaWeekInfo(value)?.weekKey ?? '';
}

/** True when estimated return time is exactly 5:00 PM. */
export function isFivePmEtb(timeStr?: string | null): boolean {
  const match = String(timeStr || '').match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return false;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours === 17 && minutes === 0;
}

export function parseMeridiemTimeInManilaDate(dateValue: Date | string, timeValue?: string): Date | null {
  if (!timeValue) return null;
  const match = String(timeValue).match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  const parts = getManilaDateParts(dateValue);
  if (!parts) return null;
  return buildManilaDate(parts.year, parts.monthIndex, parts.day, hours, minutes);
}

export type TrackerDayField = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday';

export function dayFieldFromManilaDate(value: Date | string): TrackerDayField | null {
  const info = getManilaWeekInfo(value);
  if (!info) return null;
  if (info.dayOfWeek === 1) return 'monday';
  if (info.dayOfWeek === 2) return 'tuesday';
  if (info.dayOfWeek === 3) return 'wednesday';
  if (info.dayOfWeek === 4) return 'thursday';
  if (info.dayOfWeek === 5) return 'friday';
  return null;
}

export function getManilaWeekLabel(weekKey: string): string {
  const parts = weekKey.split('-').map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return weekKey;
  const monday = buildManilaDate(parts[0], parts[1] - 1, parts[2], 0, 0);
  const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000);
  return `${monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })} - ${sunday.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  })}`;
}
