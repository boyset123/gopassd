/** CSC conversion of working hours/minutes into fractions of a day (8-hour workday). */

const HOURS_TO_DAY: Record<number, number> = {
  1: 0.125,
  2: 0.25,
  3: 0.375,
  4: 0.5,
  5: 0.625,
  6: 0.75,
  7: 0.875,
  8: 1.0,
};

const MINUTES_TO_DAY: Record<number, number> = {
  1: 0.002,
  2: 0.004,
  3: 0.006,
  4: 0.008,
  5: 0.01,
  6: 0.012,
  7: 0.015,
  8: 0.017,
  9: 0.019,
  10: 0.021,
  11: 0.023,
  12: 0.025,
  13: 0.027,
  14: 0.029,
  15: 0.031,
  16: 0.033,
  17: 0.035,
  18: 0.037,
  19: 0.04,
  20: 0.042,
  21: 0.044,
  22: 0.046,
  23: 0.048,
  24: 0.05,
  25: 0.052,
  26: 0.054,
  27: 0.056,
  28: 0.058,
  29: 0.06,
  30: 0.062,
  31: 0.065,
  32: 0.067,
  33: 0.069,
  34: 0.071,
  35: 0.073,
  36: 0.075,
  37: 0.077,
  38: 0.079,
  39: 0.081,
  40: 0.083,
  41: 0.085,
  42: 0.087,
  43: 0.09,
  44: 0.092,
  45: 0.094,
  46: 0.096,
  47: 0.098,
  48: 0.1,
  49: 0.102,
  50: 0.104,
  51: 0.106,
  52: 0.108,
  53: 0.11,
  54: 0.112,
  55: 0.115,
  56: 0.117,
  57: 0.119,
  58: 0.121,
  59: 0.123,
  60: 0.125,
};

export function hoursToEquivalentDay(hours: number): number {
  const clamped = Math.max(0, Math.min(8, Math.floor(hours)));
  return HOURS_TO_DAY[clamped] ?? 0;
}

export function minutesToEquivalentDay(minutes: number): number {
  const clamped = Math.max(0, Math.min(60, Math.floor(minutes)));
  return MINUTES_TO_DAY[clamped] ?? 0;
}

export function durationToEquivalentDay(hours: number, minutes: number): number {
  return hoursToEquivalentDay(hours) + minutesToEquivalentDay(minutes);
}

/** Format as CSC-style fraction (e.g. ".125", "1.000", "2.375"). */
export function formatEquivalentDay(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  if (rounded < 1) {
    return rounded.toFixed(3).replace(/^0/, '');
  }
  return rounded.toFixed(3);
}

export function formatSignedEquivalentDay(value: number): string {
  const formatted = formatEquivalentDay(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

export const HOURS_CONVERSION_ROWS = Object.entries(HOURS_TO_DAY).map(([hours, day]) => ({
  hours: Number(hours),
  equivalentDay: day,
}));
