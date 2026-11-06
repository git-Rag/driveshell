import React, { useState, useEffect, useRef } from 'react';
import type { FileRecord } from '../../lib/api';
import { GalleryTile } from './GalleryTile';

interface VirtualMonthSectionProps {
  monthLabel: string;
  items: FileRecord[];
  zoom: 1 | 2 | 3 | 4;
  zoomConfig: { cols: string; aspect: string; size: number };
  globalStartIndex: number;
  scrollContainer: HTMLDivElement | null;
  onTileClick: (index: number) => void;
  registerSectionRef: (month: string, el: HTMLDivElement | null) => void;
}

const ESTIMATED_ROW_HEIGHTS: Record<1 | 2 | 3 | 4, number> = {
  1: 120,
  2: 200,
  3: 280,
  4: 360,
};

const ESTIMATED_COLS: Record<1 | 2 | 3 | 4, number> = {
  1: 9,
  2: 5,
  3: 3,
  4: 2,
};

export const VirtualMonthSection = React.memo(function VirtualMonthSection({
  monthLabel,
  items,
  zoom,
  zoomConfig,
  globalStartIndex,
  scrollContainer,
  onTileClick,
  registerSectionRef,
}: VirtualMonthSectionProps) {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(() => {
    return globalStartIndex < 100;
  });

  const estimatedRows = Math.ceil(items.length / ESTIMATED_COLS[zoom]);
  const estimatedHeight = 44 + estimatedRows * (ESTIMATED_ROW_HEIGHTS[zoom] + 6);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
        }
      },
      {
        root: scrollContainer ?? null,
        rootMargin: '1200px 0px 1200px 0px',
        threshold: 0,
      },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [items.length, zoom, scrollContainer]);

  return (
    <div
      ref={(el) => {
        sectionRef.current = el;
        registerSectionRef(monthLabel, el);
      }}
      data-month={monthLabel}
      className="mb-8"
      style={{
        minHeight: !isVisible ? `${estimatedHeight}px` : undefined,
      }}
    >
      {/* Section Header */}
      <div className="flex items-baseline justify-between mb-2.5 pt-2">
        <h3 className="text-sm font-semibold tracking-wide text-zinc-200">{monthLabel}</h3>
        <span className="text-[11px] font-mono text-zinc-500">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      {/* Grid of tiles (only rendered when intersecting viewport ±1200px) */}
      {isVisible ? (
        <div className={`grid gap-1.5 ${zoomConfig.cols}`}>
          {items.map((file, idx) => (
            <GalleryTile
              key={file.id}
              file={file}
              globalIndex={globalStartIndex + idx}
              zoom={zoom}
              aspectClass={zoomConfig.aspect}
              size={zoomConfig.size}
              onClick={onTileClick}
            />
          ))}
        </div>
      ) : (
        /* Empty placeholder when far offscreen: 0 tiles, 0 network requests, 0 DOM bloat */
        <div
          className="w-full rounded-lg bg-white/[0.01]"
          style={{ height: `${recordedHeight ? recordedHeight - 44 : estimatedHeight - 44}px` }}
          aria-hidden="true"
        />
      )}
    </div>
  );
});
