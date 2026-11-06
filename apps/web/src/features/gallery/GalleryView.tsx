import { useState, useEffect, useRef, useMemo, useCallback, startTransition } from 'react';
import {
  Heart,
  RefreshCw,
  Image as ImageIcon,
  Loader2,
  Minus,
  Plus,
  Calendar,
  Sparkles,
  Film,
  Search,
  PanelLeft,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  AlertCircle,
} from 'lucide-react';
import type { AccountSummary, FileRecord, PhotoMonthBucket } from '../../lib/api';
import { getPhotos, getPhotoMonths, subscribeSyncProgress } from '../../lib/api';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { PhotoLightbox } from './PhotoLightbox';
import { VirtualMonthSection } from './VirtualMonthSection';
import { TimelineJumpPopover } from './TimelineJumpPopover';
import { isRealMedia } from '@driveshell/shared';

interface GalleryViewProps {
  account?: AccountSummary | null;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  topBarOpen?: boolean;
  onToggleTopBar?: () => void;
}

type ZoomLevel = 1 | 2 | 3 | 4;

const ZOOM_CONFIGS: Record<ZoomLevel, { cols: string; aspect: string; size: number }> = {
  1: {
    cols: 'grid-cols-5 sm:grid-cols-7 md:grid-cols-9 lg:grid-cols-11',
    aspect: 'aspect-square',
    size: 200,
  },
  2: {
    cols: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6',
    aspect: 'aspect-square',
    size: 400,
  },
  3: { cols: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4', aspect: 'aspect-[4/3]', size: 800 },
  4: { cols: 'grid-cols-1 sm:grid-cols-2', aspect: 'aspect-[16/10]', size: 1200 },
};

function formatMonthYear(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

const PAGE_SIZE = 120;

export function GalleryView({
  account,
  sidebarOpen,
  onToggleSidebar,
  topBarOpen,
  onToggleTopBar,
}: GalleryViewProps) {
  const [zoom, setZoom] = useState<ZoomLevel>(2);
  const [photos, setPhotos] = useState<FileRecord[]>([]);
  const [totalPhotos, setTotalPhotos] = useState(0);
  const [months, setMonths] = useState<PhotoMonthBucket[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'photos' | 'videos' | 'favorites'>(
    'all',
  );

  const handleFilterChange = useCallback(
    (filter: 'all' | 'photos' | 'videos' | 'favorites') => {
      if (filter === activeFilter) return;
      sectionRefs.current.clear();
      if (containerRef.current) {
        containerRef.current.scrollTop = 0;
      }
      startTransition(() => {
        setActiveFilter(filter);
      });
    },
    [activeFilter],
  );
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [currentVisibleMonth, setCurrentVisibleMonth] = useState<string>('');

  const { syncStatus, isSyncing, triggerSync, error } = useSyncStatus();
  const accountSyncInfo = syncStatus?.accounts[0] ?? null;
  const fileCount = accountSyncInfo?.fileCount ?? 0;
  const syncDone = accountSyncInfo?.fullSyncStage === 'done';

  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 1. Initial Load: fetch timeline buckets + first page
  const loadInitial = useCallback(async () => {
    setLoadingInitial(true);
    try {
      const [monthsRes, photosRes] = await Promise.all([
        getPhotoMonths({ type: activeFilter }),
        getPhotos({ offset: 0, limit: PAGE_SIZE, type: activeFilter }),
      ]);
      startTransition(() => {
        setMonths(monthsRes.months);
        setPhotos(photosRes.files.filter(isRealMedia));
        setTotalPhotos(photosRes.total);

        if (photosRes.files.length > 0 && photosRes.files[0]) {
          const firstTime = photosRes.files[0].taken_at ?? photosRes.files[0].modified_at;
          setCurrentVisibleMonth(formatMonthYear(firstTime));
        } else if (monthsRes.months.length > 0 && monthsRes.months[0]) {
          setCurrentVisibleMonth(monthsRes.months[0].label);
        }
      });
    } catch {
      // ignore
    } finally {
      setLoadingInitial(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial, syncDone]);

  // 2. Progressive Infinite Scroll Load
  const loadMorePhotos = useCallback(async () => {
    if (loadingMore || loadingInitial || photos.length >= totalPhotos) return;

    setLoadingMore(true);
    try {
      const res = await getPhotos({
        offset: photos.length,
        limit: PAGE_SIZE,
        type: activeFilter,
      });

      setPhotos((prev) => {
        // De-duplicate by ID and strictly enforce media filter
        const existingIds = new Set(prev.map((p) => p.id));
        const newItems = res.files.filter((f) => !existingIds.has(f.id) && isRealMedia(f));
        return [...prev, ...newItems];
      });
      setTotalPhotos(res.total);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }, [photos.length, totalPhotos, loadingMore, loadingInitial, activeFilter]);

  const loadPhotosAtOffset = useCallback(
    async (offset: number) => {
      try {
        const res = await getPhotos({
          offset,
          limit: PAGE_SIZE,
          type: activeFilter,
        });

        setPhotos((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const newItems = res.files.filter((f) => !existingIds.has(f.id) && isRealMedia(f));
          return [...prev, ...newItems].sort(
            (a, b) => (b.taken_at ?? b.modified_at) - (a.taken_at ?? a.modified_at),
          );
        });
      } catch {
        // ignore
      }
    },
    [activeFilter],
  );

  // Infinite scroll trigger via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMorePhotos();
        }
      },
      { root: containerRef.current, rootMargin: '600px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMorePhotos]);

  const lastReloadTimeRef = useRef<number>(0);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Background sync listener — refresh library when sync completes or as files arrive (throttled to 15s to prevent rate limits)
  useEffect(() => {
    const THROTTLE_MS = 15_000;

    const unsub = subscribeSyncProgress((event) => {
      if (event.type === 'done') {
        if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
        void loadInitial();
      } else if (event.type === 'progress' && (event.indexed ?? 0) > 0) {
        const now = Date.now();
        if (photos.length === 0) {
          lastReloadTimeRef.current = now;
          void loadInitial();
        } else if (now - lastReloadTimeRef.current >= THROTTLE_MS) {
          lastReloadTimeRef.current = now;
          void loadInitial();
        } else if (!reloadTimerRef.current) {
          const delay = Math.max(1000, THROTTLE_MS - (now - lastReloadTimeRef.current));
          reloadTimerRef.current = setTimeout(() => {
            reloadTimerRef.current = null;
            lastReloadTimeRef.current = Date.now();
            void loadInitial();
          }, delay);
        }
      }
    });

    return () => {
      unsub();
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    };
  }, [loadInitial, photos.length]);

  useEffect(() => {
    if (fileCount > 0 && photos.length === 0) {
      void loadInitial();
    }
  }, [fileCount, loadInitial, photos.length]);

  // Group photos into chronologically ordered Month Year buckets with running index offsets
  const groupedSections = useMemo(() => {
    const groups = new Map<string, FileRecord[]>();

    for (const photo of photos) {
      const time = photo.taken_at ?? photo.modified_at;
      const key = formatMonthYear(time);
      const existing = groups.get(key) ?? [];
      existing.push(photo);
      groups.set(key, existing);
    }

    let runningOffset = 0;
    return Array.from(groups.entries()).map(([monthLabel, items]) => {
      const globalStartIndex = runningOffset;
      runningOffset += items.length;
      return {
        monthLabel,
        items,
        count: items.length,
        globalStartIndex,
      };
    });
  }, [photos]);

  // Extract distinct real years from the DB months for the right rail
  const timelineYears = useMemo(() => {
    const yearSet = new Set<number>();
    months.forEach((m) => yearSet.add(m.year));
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [months]);

  // Register section element callback
  const registerSectionRef = useCallback((month: string, el: HTMLDivElement | null) => {
    if (el) sectionRefs.current.set(month, el);
    else sectionRefs.current.delete(month);
  }, []);

  // Track currently visible month asynchronously via IntersectionObserver without synchronous layout reflows
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const month = entry.target.getAttribute('data-month');
            if (month) {
              setCurrentVisibleMonth(month);
              break;
            }
          }
        }
      },
      {
        root: container,
        rootMargin: '-60px 0px -75% 0px',
        threshold: 0,
      },
    );

    for (const el of sectionRefs.current.values()) {
      if (el && el.isConnected) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [groupedSections]);

  function scrollToSection(monthLabel: string) {
    const target = sectionRefs.current.get(monthLabel);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  const [isJumpPopoverOpen, setIsJumpPopoverOpen] = useState(false);

  const scrollToTop = useCallback(() => {
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, []);

  const handleJumpToMonth = useCallback(
    (monthLabel: string) => {
      const target = sectionRefs.current.get(monthLabel);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      // If month section is not currently in memory, find its offset from `months`
      const targetIdx = months.findIndex((m) => m.label === monthLabel);
      if (targetIdx !== -1) {
        const targetOffset = months.slice(0, targetIdx).reduce((acc, m) => acc + m.count, 0);
        void loadPhotosAtOffset(targetOffset).then(() => {
          setTimeout(() => {
            const el = sectionRefs.current.get(monthLabel);
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
        });
      }
    },
    [months, loadPhotosAtOffset],
  );

  // Global hotkeys: 'G' opens Jump Popover, 'Home' jumps to newest, 'End' jumps to oldest
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'g' || e.key === 'G') {
        if (lightboxIndex === null) {
          e.preventDefault();
          setIsJumpPopoverOpen((prev) => !prev);
        }
      } else if (e.key === 'Home') {
        if (lightboxIndex === null && !isJumpPopoverOpen) {
          e.preventDefault();
          scrollToTop();
        }
      } else if (e.key === 'End') {
        if (lightboxIndex === null && !isJumpPopoverOpen) {
          e.preventDefault();
          scrollToBottom();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxIndex, isJumpPopoverOpen, scrollToTop, scrollToBottom]);

  function handleZoomIn() {
    setZoom((z) => Math.min(4, z + 1) as ZoomLevel);
  }

  function handleZoomOut() {
    setZoom((z) => Math.max(1, z - 1) as ZoomLevel);
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--ds-bg)] text-white relative select-none overflow-hidden">
      {/* Sleek Floating OneDrive Header */}
      <div className="z-30 px-6 py-2.5 flex items-center justify-between border-b border-[var(--ds-border-subtle)] bg-[var(--ds-bg)]/85 backdrop-blur-xl">
        {/* Left: Sidebar & TopBar Toggles + Dynamic Floating Month Badge */}
        <div className="flex items-center gap-2.5">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className={`p-2 rounded-full border transition-all ${
                sidebarOpen
                  ? 'bg-brand text-white border-brand ring-2 ring-brand/30'
                  : 'bg-zinc-900/90 border-white/10 text-zinc-300 hover:text-white hover:border-white/30 active:scale-95'
              } shadow-lg`}
              title="Toggle sidebar (Ctrl+B)"
            >
              <PanelLeft size={15} />
            </button>
          )}

          {onToggleTopBar && (
            <button
              onClick={onToggleTopBar}
              className={`p-2 rounded-full border transition-all ${
                topBarOpen
                  ? 'bg-brand text-white border-brand ring-2 ring-brand/30'
                  : 'bg-zinc-900/90 border-white/10 text-zinc-300 hover:text-white hover:border-white/30 active:scale-95'
              } shadow-lg`}
              title="Toggle search & top bar"
            >
              <Search size={14} />
            </button>
          )}

          {/* Interactive Month Chip Popover Trigger */}
          <button
            onClick={() => setIsJumpPopoverOpen(true)}
            data-testid="timeline-month-chip"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 border border-white/10 hover:border-brand/70 text-xs font-semibold tracking-wide text-zinc-200 hover:text-white transition-all shadow-md active:scale-95 group cursor-pointer"
            title="Jump to timeline month (G)"
            aria-label="Open timeline month jump popover"
          >
            <Calendar size={13} className="text-brand group-hover:scale-110 transition-transform" />
            <span>{currentVisibleMonth || 'Gallery'}</span>
            <ChevronDown
              size={12}
              className="text-zinc-400 group-hover:text-white transition-colors"
            />
          </button>

          <span className="hidden md:inline-block text-[11px] font-mono text-zinc-400">
            {totalPhotos > 0 ? `${totalPhotos.toLocaleString()} items` : ''}
          </span>
        </div>

        {/* Center: Filter Toggle Pills */}
        <div className="flex items-center gap-1 bg-zinc-900/80 p-1 rounded-full border border-white/10 shadow-lg backdrop-blur-md">
          <button
            onClick={() => handleFilterChange('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              activeFilter === 'all'
                ? 'bg-brand text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            All
          </button>
          <button
            onClick={() => handleFilterChange('photos')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
              activeFilter === 'photos'
                ? 'bg-brand text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <ImageIcon size={12} />
            <span>Photos</span>
          </button>
          <button
            onClick={() => handleFilterChange('videos')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
              activeFilter === 'videos'
                ? 'bg-brand text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Film size={12} />
            <span>Videos</span>
          </button>
          <button
            onClick={() => handleFilterChange('favorites')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
              activeFilter === 'favorites'
                ? 'bg-brand text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Heart size={12} />
            <span>Favorites</span>
          </button>
        </div>

        {/* Right: Circular Zoom Buttons matching OneDrive reference */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleZoomOut}
            disabled={zoom === 1}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all bg-zinc-900/90 border ${
              zoom === 1
                ? 'border-white/5 text-zinc-600 cursor-not-allowed'
                : 'border-white/10 text-zinc-300 hover:text-white hover:border-white/30 active:scale-95'
            } shadow-md`}
            title="Zoom out"
          >
            <Minus size={14} />
          </button>

          <button
            onClick={handleZoomIn}
            disabled={zoom === 4}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all bg-zinc-900/90 border ${
              zoom === 4
                ? 'border-white/5 text-zinc-600 cursor-not-allowed'
                : 'border-white/10 text-zinc-300 hover:text-white hover:border-white/30 active:scale-95'
            } shadow-md`}
            title="Zoom in"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Main Continuous Scroll Area */}
      <div
        ref={(el) => {
          containerRef.current = el;
          if (el && el !== scrollContainer) setScrollContainer(el);
        }}
        data-testid="gallery-scroll-container"
        className="flex-1 overflow-y-auto px-6 sm:px-10 py-5 pb-32"
      >
        {/* Sync Prompt if zero files */}
        {!syncDone && fileCount === 0 && !loadingInitial && (
          <div className="card p-6 mb-8 max-w-xl mx-auto text-center border-brand/30 bg-gradient-to-b from-brand/10 to-transparent">
            <Sparkles size={28} className="text-brand mx-auto mb-3" />
            <h3 className="text-base font-bold text-white mb-1">Your Photo Library</h3>
            <p className="text-xs text-zinc-400 mb-4 max-w-md mx-auto">
              Connect and sync your Google Drive to index all photos and videos with EXIF metadata
              into high-speed local SQLite.
            </p>
            <button
              onClick={() => account && triggerSync(account.id)}
              disabled={isSyncing || !account}
              className="btn-primary text-xs py-2 px-5 mx-auto flex items-center gap-2"
            >
              <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? 'Syncing Drive…' : 'Start Photo Sync'}
            </button>
            {error && (
              <div className="mt-4 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-center gap-2 max-w-md mx-auto animate-in fade-in">
                <AlertCircle size={14} className="shrink-0 text-rose-400" />
                <span className="truncate">{error}</span>
                {account && (
                  <button
                    onClick={() => triggerSync(account.id)}
                    className="font-semibold underline ml-1.5 hover:text-white shrink-0"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Initial Loading Skeleton */}
        {loadingInitial && photos.length === 0 && (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <Loader2 size={28} className="text-brand animate-spin" />
            <span className="text-xs text-zinc-500 font-mono tracking-wider">
              Loading your library…
            </span>
          </div>
        )}

        {/* Virtualized Chronological Sections */}
        {groupedSections.map(({ monthLabel, items, globalStartIndex }) => (
          <VirtualMonthSection
            key={monthLabel}
            monthLabel={monthLabel}
            items={items}
            zoom={zoom}
            zoomConfig={ZOOM_CONFIGS[zoom]}
            globalStartIndex={globalStartIndex}
            scrollContainer={scrollContainer}
            onTileClick={setLightboxIndex}
            registerSectionRef={registerSectionRef}
          />
        ))}

        {/* Sentinel element to trigger infinite scroll */}
        <div ref={sentinelRef} className="py-6 flex justify-center items-center">
          {loadingMore && (
            <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
              <Loader2 size={16} className="animate-spin text-brand" />
              <span>
                Loading more items… ({photos.length} of {totalPhotos})
              </span>
            </div>
          )}
          {!loadingMore && photos.length >= totalPhotos && totalPhotos > 0 && (
            <span className="text-[11px] font-mono text-zinc-600">
              All {totalPhotos.toLocaleString()} items loaded
            </span>
          )}
        </div>
      </div>

      {/* Right Timeline Year Scrubber Rail matching OneDrive Screenshot */}
      {timelineYears.length > 0 && (
        <div className="absolute right-2 top-20 bottom-24 w-8 flex flex-col items-center justify-between pointer-events-auto z-20 py-2 select-none">
          <span className="text-[10px] font-mono font-bold text-zinc-400">{timelineYears[0]}</span>

          <div className="flex flex-col items-center gap-2.5 my-auto">
            {timelineYears.map((yr) => (
              <button
                key={yr}
                onClick={() => {
                  const targetMonth = months.find((m) => m.year === yr);
                  if (targetMonth) scrollToSection(targetMonth.label);
                }}
                className="group relative flex items-center justify-center p-1"
                title={`Jump to ${yr}`}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-600 group-hover:bg-brand group-hover:scale-150 transition-all" />
                <span className="absolute right-5 px-2 py-0.5 rounded bg-zinc-900 border border-white/10 text-[10px] font-mono text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl whitespace-nowrap">
                  {yr}
                </span>
              </button>
            ))}
          </div>

          <span className="text-[10px] font-mono text-zinc-600">
            {timelineYears[timelineYears.length - 1]}
          </span>
        </div>
      )}

      {/* Floating Quick Jump Pills (Newest / Oldest) */}
      <div className="absolute right-14 bottom-6 z-20 flex items-center gap-1.5 select-none pointer-events-auto">
        <button
          onClick={scrollToTop}
          data-testid="jump-to-newest-btn"
          className="p-2 rounded-full bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 hover:border-brand/60 text-zinc-300 hover:text-white shadow-xl backdrop-blur-md transition-all active:scale-95 group"
          title="Jump to newest (Home)"
          aria-label="Jump to newest photos"
        >
          <ArrowUp size={14} className="text-brand group-hover:scale-110 transition-transform" />
        </button>
        <button
          onClick={scrollToBottom}
          data-testid="jump-to-oldest-btn"
          className="p-2 rounded-full bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 hover:border-brand/60 text-zinc-300 hover:text-white shadow-xl backdrop-blur-md transition-all active:scale-95 group"
          title="Jump to oldest (End)"
          aria-label="Jump to oldest photos"
        >
          <ArrowDown size={14} className="text-brand group-hover:scale-110 transition-transform" />
        </button>
      </div>

      {/* Timeline Jump Month Popover */}
      <TimelineJumpPopover
        isOpen={isJumpPopoverOpen}
        onClose={() => setIsJumpPopoverOpen(false)}
        months={months}
        currentVisibleMonth={currentVisibleMonth}
        onJumpToMonth={handleJumpToMonth}
        onJumpToNewest={scrollToTop}
        onJumpToOldest={scrollToBottom}
      />

      {/* Full Lightbox Modal */}
      {lightboxIndex !== null && (
        <PhotoLightbox
          files={photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onFileUpdated={(updated) => {
            setPhotos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          }}
        />
      )}
    </div>
  );
}
