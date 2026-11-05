import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Heart,
  RefreshCw,
  Image as ImageIcon,
  Loader2,
  Minus,
  Plus,
  Play,
  Calendar,
  Sparkles,
  Film,
  Search,
  PanelLeft,
} from 'lucide-react';
import type { AccountSummary, FileRecord, PhotoMonthBucket } from '../../lib/api';
import { getPhotos, getPhotoMonths, subscribeSyncProgress } from '../../lib/api';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { PhotoLightbox } from './PhotoLightbox';
import { MediaThumbnail } from './MediaThumbnail';
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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [currentVisibleMonth, setCurrentVisibleMonth] = useState<string>('');

  const { syncStatus, isSyncing, triggerSync } = useSyncStatus();
  const accountSyncInfo = syncStatus?.accounts[0] ?? null;
  const fileCount = accountSyncInfo?.fileCount ?? 0;
  const syncDone = accountSyncInfo?.fullSyncStage === 'done';

  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 1. Initial Load: fetch timeline buckets + first page
  const loadInitial = useCallback(async () => {
    setLoadingInitial(true);
    try {
      const [monthsRes, photosRes] = await Promise.all([
        getPhotoMonths(),
        getPhotos({ offset: 0, limit: PAGE_SIZE, type: activeFilter }),
      ]);
      setMonths(monthsRes.months);
      setPhotos(photosRes.files.filter(isRealMedia));
      setTotalPhotos(photosRes.total);

      if (photosRes.files.length > 0 && photosRes.files[0]) {
        const firstTime = photosRes.files[0].taken_at ?? photosRes.files[0].modified_at;
        setCurrentVisibleMonth(formatMonthYear(firstTime));
      } else if (monthsRes.months.length > 0 && monthsRes.months[0]) {
        setCurrentVisibleMonth(monthsRes.months[0].label);
      }
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

  // Background sync listener
  useEffect(() => {
    if (!isSyncing) return;
    const unsub = subscribeSyncProgress((event) => {
      if (event.type === 'done') {
        void loadInitial();
      }
    });
    return unsub;
  }, [isSyncing, loadInitial]);

  // Group photos into chronologically ordered Month Year buckets
  const groupedSections = useMemo(() => {
    const groups = new Map<string, FileRecord[]>();

    for (const photo of photos) {
      const time = photo.taken_at ?? photo.modified_at;
      const key = formatMonthYear(time);
      const existing = groups.get(key) ?? [];
      existing.push(photo);
      groups.set(key, existing);
    }

    return Array.from(groups.entries()).map(([monthLabel, items]) => ({
      monthLabel,
      items,
      count: items.length,
    }));
  }, [photos]);

  // Extract distinct real years from the DB months for the right rail
  const timelineYears = useMemo(() => {
    const yearSet = new Set<number>();
    months.forEach((m) => yearSet.add(m.year));
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [months]);

  // Track currently visible month as user scrolls
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const entries = Array.from(sectionRefs.current.entries());
      const containerTop = container.getBoundingClientRect().top;

      for (const [month, el] of entries) {
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top - containerTop <= 180 && rect.bottom - containerTop > 80) {
            setCurrentVisibleMonth(month);
            break;
          }
        }
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [groupedSections]);

  function scrollToSection(monthLabel: string) {
    const target = sectionRefs.current.get(monthLabel);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

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

          <div className="flex items-center gap-2 bg-zinc-900/90 border border-white/10 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide text-white shadow-lg backdrop-blur-md">
            <Calendar size={13} className="text-brand" />
            <span>{currentVisibleMonth || 'Gallery'}</span>
          </div>

          <span className="hidden md:inline-block text-[11px] font-mono text-zinc-400">
            {totalPhotos > 0 ? `${totalPhotos.toLocaleString()} items` : ''}
          </span>
        </div>

        {/* Center: Filter Toggle Pills */}
        <div className="flex items-center gap-1 bg-zinc-900/80 p-1 rounded-full border border-white/10 shadow-lg backdrop-blur-md">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              activeFilter === 'all'
                ? 'bg-brand text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setActiveFilter('photos')}
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
            onClick={() => setActiveFilter('videos')}
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
            onClick={() => setActiveFilter('favorites')}
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
        ref={containerRef}
        className="flex-1 overflow-y-auto px-6 sm:px-10 py-5 pb-32 scroll-smooth"
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

        {/* Grouped Chronological Sections */}
        {groupedSections.map(({ monthLabel, items }) => (
          <div
            key={monthLabel}
            ref={(el) => {
              if (el) sectionRefs.current.set(monthLabel, el);
              else sectionRefs.current.delete(monthLabel);
            }}
            data-month={monthLabel}
            className="mb-8"
          >
            {/* Clean Section Header */}
            <div className="flex items-baseline justify-between mb-2.5 pt-2">
              <h3 className="text-sm font-semibold tracking-wide text-zinc-200">{monthLabel}</h3>
              <span className="text-[11px] font-mono text-zinc-500">
                {items.length} {items.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            {/* Photo Grid with fluid zoom transitions */}
            <div
              className={`grid gap-1.5 transition-all duration-300 ease-out ${
                ZOOM_CONFIGS[zoom].cols
              }`}
            >
              {items.map((file) => {
                const isVideo = file.mime_type.startsWith('video/');
                const globalIndex = photos.indexOf(file);

                return (
                  <div
                    key={file.id}
                    onClick={() => setLightboxIndex(globalIndex)}
                    className={`group relative rounded-lg overflow-hidden bg-zinc-900 border border-white/5 cursor-pointer transition-all duration-200 hover:border-brand/70 hover:scale-[1.015] hover:z-10 hover:shadow-2xl ${
                      ZOOM_CONFIGS[zoom].aspect
                    }`}
                  >
                    {/* Thumbnail Image / Placeholder */}
                    <MediaThumbnail file={file} size={ZOOM_CONFIGS[zoom].size} />

                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex flex-col justify-between p-2">
                      {/* Top Badges */}
                      <div className="flex items-center justify-between">
                        {file.starred === 1 ? (
                          <span className="p-1 rounded-full bg-rose-500/80 text-white backdrop-blur-sm">
                            <Heart size={11} fill="currentColor" />
                          </span>
                        ) : (
                          <div />
                        )}
                        {isVideo && (
                          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-white font-mono">
                            <Play size={8} fill="currentColor" /> Video
                          </span>
                        )}
                      </div>

                      {/* Bottom Title on larger zoom */}
                      {zoom >= 3 && (
                        <div className="truncate">
                          <p className="text-[11px] font-medium text-white truncate drop-shadow-sm">
                            {file.name}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Center Video Indicator */}
                    {isVideo && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none group-hover:opacity-0 transition-opacity">
                        <div className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/90">
                          <Play size={12} fill="currentColor" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
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
