/**
 * Strips a trailing parenthetical from arrival status strings from the API,
 * e.g. "On Time (10:24AM)" → "On Time", "Overdue by 5 min (10:24AM)" → "Overdue by 5 min".
 */
export function stripArrivalStatusDisplaySuffix(status: string): string {
  return String(status || '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();
}
