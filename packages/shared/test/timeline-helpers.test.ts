import { describe, it, expect } from 'vitest';
import {
  formatMonthKey,
  parseMonthKey,
  formatMonthLabel,
  MONTH_NAMES,
  MONTH_SHORT_NAMES,
} from '../src/media/timeline-helpers';

describe('timeline-helpers', () => {
  it('formats month key with 2-digit padding', () => {
    expect(formatMonthKey(2026, 1)).toBe('2026-01');
    expect(formatMonthKey(2026, 10)).toBe('2026-10');
    expect(formatMonthKey(2023, 12)).toBe('2023-12');
  });

  it('clamps out of bounds months gracefully', () => {
    expect(formatMonthKey(2024, 0)).toBe('2024-01');
    expect(formatMonthKey(2024, 15)).toBe('2024-12');
  });

  it('parses valid month keys', () => {
    expect(parseMonthKey('2026-10')).toEqual({ year: 2026, month: 10 });
    expect(parseMonthKey('2021-04')).toEqual({ year: 2021, month: 4 });
  });

  it('rejects invalid month keys', () => {
    expect(parseMonthKey('invalid')).toBeNull();
    expect(parseMonthKey('2026-13')).toBeNull();
    expect(parseMonthKey('2026-00')).toBeNull();
    expect(parseMonthKey('')).toBeNull();
  });

  it('formats human readable month labels', () => {
    expect(formatMonthLabel(2026, 10)).toBe('October 2026');
    expect(formatMonthLabel(2024, 1)).toBe('January 2024');
  });

  it('provides complete month names and short names', () => {
    expect(MONTH_NAMES).toHaveLength(12);
    expect(MONTH_SHORT_NAMES).toHaveLength(12);
    expect(MONTH_SHORT_NAMES[0]).toBe('Jan');
    expect(MONTH_SHORT_NAMES[9]).toBe('Oct');
  });
});
