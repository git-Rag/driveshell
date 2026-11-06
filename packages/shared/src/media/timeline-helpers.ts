/**
 * timeline-helpers.ts — Pure helper functions for timeline keys, labels, and date bucketing.
 *
 * Invariant: Pure browser- and node-safe code. Zero Node-only imports.
 */

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const MONTH_SHORT_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * Returns a standardized month key, e.g. `formatMonthKey(2026, 10)` -> `"2026-10"`.
 * `month` is 1-indexed (1 to 12).
 */
export function formatMonthKey(year: number, month: number): string {
  const m = Math.max(1, Math.min(12, Math.floor(month)));
  const mm = m < 10 ? `0${m}` : `${m}`;
  return `${Math.floor(year)}-${mm}`;
}

/**
 * Parses a month key such as `"2026-10"` into `{ year: 2026, month: 10 }`.
 * Returns `null` if invalid.
 */
export function parseMonthKey(key: string): { year: number; month: number } | null {
  if (!key || typeof key !== 'string') return null;
  const match = /^(\d{4})-(\d{2})$/.exec(key.trim());
  if (!match || !match[1] || !match[2]) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return null;

  return { year, month };
}

/**
 * Formats a year and 1-indexed month into a human readable label, e.g. `"October 2026"`.
 */
export function formatMonthLabel(year: number, month: number): string {
  const m = Math.max(1, Math.min(12, Math.floor(month)));
  const name = MONTH_NAMES[m - 1] ?? 'Unknown';
  return `${name} ${year}`;
}
