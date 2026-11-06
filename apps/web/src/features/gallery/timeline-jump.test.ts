import { describe, it, expect } from 'vitest';
import { formatMonthLabel, formatMonthKey, parseMonthKey } from '@driveshell/shared';

describe('Timeline Jump Logic', () => {
  it('formats month labels correctly for popover display', () => {
    expect(formatMonthLabel(2026, 10)).toBe('October 2026');
    expect(formatMonthLabel(2021, 5)).toBe('May 2021');
  });

  it('calculates 4x3 grid navigation index shifts accurately', () => {
    // 4x3 grid has 12 cells (0-11)
    // ArrowRight (+1)
    const right = (idx: number) => (idx < 11 ? idx + 1 : 0);
    expect(right(0)).toBe(1);
    expect(right(11)).toBe(0);

    // ArrowLeft (-1)
    const left = (idx: number) => (idx > 0 ? idx - 1 : 11);
    expect(left(1)).toBe(0);
    expect(left(0)).toBe(11);

    // ArrowDown (+4 rows)
    const down = (idx: number) => (idx <= 7 ? idx + 4 : idx - 8);
    expect(down(0)).toBe(4); // Jan -> May
    expect(down(8)).toBe(0); // Sep -> Jan

    // ArrowUp (-4 rows)
    const up = (idx: number) => (idx >= 4 ? idx - 4 : idx + 8);
    expect(up(4)).toBe(0); // May -> Jan
    expect(up(1)).toBe(9); // Feb -> Oct
  });

  it('parses and formats month keys bidirectionally', () => {
    const key = formatMonthKey(2024, 8);
    expect(key).toBe('2024-08');
    const parsed = parseMonthKey(key);
    expect(parsed).toEqual({ year: 2024, month: 8 });
  });
});
