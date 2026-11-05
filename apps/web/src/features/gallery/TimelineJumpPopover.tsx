import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronLeft, ChevronRight, X, Calendar, ArrowUp, ArrowDown } from 'lucide-react';
import type { PhotoMonthBucket } from '../../lib/api';
import { MONTH_SHORT_NAMES, formatMonthLabel } from '@driveshell/shared';

export interface TimelineJumpPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  months: PhotoMonthBucket[];
  currentVisibleMonth: string;
  onJumpToMonth: (monthLabel: string) => void;
  onJumpToNewest: () => void;
  onJumpToOldest: () => void;
}

export const TimelineJumpPopover: React.FC<TimelineJumpPopoverProps> = ({
  isOpen,
  onClose,
  months,
  currentVisibleMonth,
  onJumpToMonth,
  onJumpToNewest,
  onJumpToOldest,
}) => {
  // Extract all available years from months data
  const availableYears = useMemo(() => {
    const years = Array.from(new Set(months.map((m) => m.year))).sort((a, b) => b - a);
    return years.length > 0 ? years : [new Date().getFullYear()];
  }, [months]);

  // Current year being viewed in the 4x3 grid
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const curYear = parseInt(currentVisibleMonth.split(' ')[1] ?? '', 10);
    return !isNaN(curYear) ? curYear : (availableYears[0] ?? new Date().getFullYear());
  });

  // Focused month in 4x3 grid (0 to 11 for Jan to Dec)
  const [focusedMonthIndex, setFocusedMonthIndex] = useState<number>(() => {
    const now = new Date();
    return now.getMonth();
  });

  const dialogRef = useRef<HTMLDivElement>(null);
  const activeBtnRef = useRef<HTMLButtonElement>(null);

  // Sync selected year if current visible month changes
  useEffect(() => {
    const curYear = parseInt(currentVisibleMonth.split(' ')[1] ?? '', 10);
    if (!isNaN(curYear) && curYear !== selectedYear) {
      setSelectedYear(curYear);
    }
  }, [currentVisibleMonth, selectedYear]);

  // Map of "YYYY-MM" -> count for O(1) lookup in the 4x3 grid
  const monthCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of months) {
      map.set(`${m.year}-${m.monthKey?.split('-')[1] ?? ''}`, m.count);
    }
    return map;
  }, [months]);

  // Trap focus & keyboard navigation inside dialog
  useEffect(() => {
    if (!isOpen) return;

    activeBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Home') {
        e.preventDefault();
        onJumpToNewest();
        onClose();
        return;
      }

      if (e.key === 'End') {
        e.preventDefault();
        onJumpToOldest();
        onClose();
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setFocusedMonthIndex((prev) => (prev > 0 ? prev - 1 : 11));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setFocusedMonthIndex((prev) => (prev < 11 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedMonthIndex((prev) => (prev >= 4 ? prev - 4 : prev + 8));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedMonthIndex((prev) => (prev <= 7 ? prev + 4 : prev - 8));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onJumpToNewest, onJumpToOldest]);

  if (!isOpen) return null;

  const currentYearIdx = availableYears.indexOf(selectedYear);
  const canGoPrevYear = currentYearIdx < availableYears.length - 1;
  const canGoNextYear = currentYearIdx > 0;

  function handleSelectMonth(monthIndex: number) {
    const monthNum = monthIndex + 1;
    const label = formatMonthLabel(selectedYear, monthNum);
    onJumpToMonth(label);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Jump to timeline month"
        className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-white/10 shadow-2xl p-5 text-white select-none relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Title + Close */}
        <div className="flex items-center justify-between pb-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-brand" />
            <span className="text-xs font-bold tracking-wider uppercase text-zinc-300">
              Jump to Month
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close dialog"
          >
            <X size={15} />
          </button>
        </div>

        {/* Year Selector Bar */}
        <div className="flex items-center justify-between my-4 px-2">
          <button
            onClick={() =>
              canGoPrevYear && setSelectedYear(availableYears[currentYearIdx + 1] ?? selectedYear)
            }
            disabled={!canGoPrevYear}
            className="p-1.5 rounded-lg border border-white/10 hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300 hover:text-white transition-all flex items-center gap-1 text-xs"
            title="Previous year"
          >
            <ChevronLeft size={14} />
            <span>Prev</span>
          </button>

          <span className="text-base font-bold font-mono text-zinc-100 tracking-wider">
            {selectedYear}
          </span>

          <button
            onClick={() =>
              canGoNextYear && setSelectedYear(availableYears[currentYearIdx - 1] ?? selectedYear)
            }
            disabled={!canGoNextYear}
            className="p-1.5 rounded-lg border border-white/10 hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300 hover:text-white transition-all flex items-center gap-1 text-xs"
            title="Next year"
          >
            <span>Next</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* 4x3 Month Grid */}
        <div className="grid grid-cols-4 gap-2 my-2">
          {MONTH_SHORT_NAMES.map((name, idx) => {
            const monthNum = idx + 1;
            const mm = monthNum < 10 ? `0${monthNum}` : `${monthNum}`;
            const count = monthCountMap.get(`${selectedYear}-${mm}`) ?? 0;
            const label = formatMonthLabel(selectedYear, monthNum);
            const isCurrent = label === currentVisibleMonth;
            const isFocused = focusedMonthIndex === idx;
            const hasItems = count > 0;

            return (
              <button
                key={name}
                ref={isFocused ? activeBtnRef : undefined}
                disabled={!hasItems}
                onClick={() => handleSelectMonth(idx)}
                className={`py-2 px-1 rounded-xl text-xs flex flex-col items-center justify-center transition-all ${
                  isCurrent
                    ? 'bg-brand text-white font-bold ring-2 ring-brand/50 shadow-lg'
                    : hasItems
                      ? 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 border border-white/5 active:scale-95'
                      : 'bg-zinc-950/40 text-zinc-600 border border-transparent cursor-not-allowed'
                } ${isFocused && !isCurrent ? 'ring-1 ring-white/40' : ''}`}
                aria-label={`${name} ${selectedYear}, ${count} items`}
              >
                <span className="font-semibold">{name}</span>
                <span
                  className={`text-[10px] font-mono mt-0.5 ${hasItems ? 'text-zinc-400' : 'text-zinc-700'}`}
                >
                  {count > 0 ? count : '—'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Quick Jump Buttons: Newest / Oldest */}
        <div className="flex items-center justify-between gap-2 pt-4 mt-3 border-t border-white/5 text-[11px]">
          <button
            onClick={() => {
              onJumpToNewest();
              onClose();
            }}
            className="flex-1 py-1.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-white/5 text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 transition-all active:scale-95"
          >
            <ArrowUp size={12} className="text-brand" />
            <span>Newest (Home)</span>
          </button>
          <button
            onClick={() => {
              onJumpToOldest();
              onClose();
            }}
            className="flex-1 py-1.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-white/5 text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 transition-all active:scale-95"
          >
            <ArrowDown size={12} className="text-brand" />
            <span>Oldest (End)</span>
          </button>
        </div>

        {/* Footer shortcuts hint */}
        <div className="mt-3 text-[10px] text-center text-zinc-500 font-mono">
          Press{' '}
          <kbd className="px-1 py-0.5 bg-zinc-800 rounded border border-white/10 text-zinc-300">
            Esc
          </kbd>{' '}
          to close · Arrows to navigate
        </div>
      </div>
    </div>
  );
};
