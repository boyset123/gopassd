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

export function getManilaTodayStart(now: Date): Date {
  const parts = getManilaDateParts(now);
  if (!parts) return now;
  return buildManilaDate(parts.year, parts.monthIndex, parts.day, 0, 0);
}

export function isSameManilaDay(a: Date, b: Date): boolean {
  const pa = getManilaDateParts(a);
  const pb = getManilaDateParts(b);
  if (!pa || !pb) return false;
  return pa.year === pb.year && pa.monthIndex === pb.monthIndex && pa.day === pb.day;
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

export function formatManilaDateYmd(value: Date | string): string {
  const parts = getManilaDateParts(value);
  if (!parts) return '';
  return `${parts.year}-${String(parts.monthIndex + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
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

export function addDaysToYmd(ymd: string, days: number): string {
  const parts = ymd.split('-').map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return ymd;
  const d = buildManilaDate(parts[0], parts[1] - 1, parts[2] + days, 0, 0);
  return formatManilaDateYmd(d);
}

export function formatManilaDayLabel(ymd: string): string {
  const parts = ymd.split('-').map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return ymd;
  const d = buildManilaDate(parts[0], parts[1] - 1, parts[2], 0, 0);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
}

export function formatManilaMonthYear(year: number, monthIndex: number): string {
  const d = buildManilaDate(year, monthIndex, 1, 0, 0);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'Asia/Manila' });
}
