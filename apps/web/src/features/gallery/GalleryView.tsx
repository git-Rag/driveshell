import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Grid,
  Heart,
  SlidersHorizontal,
  RefreshCw,
  Image as ImageIcon,
  Clock,
  Layers,
  Users,
  Loader2,
  HardDrive,
  Filter,
  Minus,
  Plus,
  Play,
  Calendar,
  Search,
  Sparkles,
} from 'lucide-react';
import type { AccountSummary, FileRecord, PhotoMonthBucket } from '../../lib/api';
import {
  getPhotos,
  getPhotoMonths,
  getMediaThumbUrl,
  subscribeSyncProgress,
} from '../../lib/api';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { PhotoLightbox } from './PhotoLightbox';

interface GalleryViewProps {
  account?: AccountSummary | null;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

// 4 distinct zoom density levels matching OneDrive
type ZoomLevel = 1 | 2 | 3 | 4;

const ZOOM_CONFIGS: Record<ZoomLevel, { cols: string; aspect: string; size: number }> = {
  1: { cols: 'grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10', aspect: 'aspect-square', size: 200 },
  2: { cols: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6', aspect: 'aspect-square', size: 400 },
  3: { cols: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4', aspect: 'aspect-[4/3]', size: 800 },
  4: { cols: 'grid-cols-1 sm:grid-cols-2', aspect: 'aspect-[16/10]', size: 1200 },
};

function formatMonthYear(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function GalleryView({ account, activeTab = 'gallery', onTabChange }: GalleryViewProps) {
  const [zoom, setZoom] = useState<ZoomLevel>(2);
  const [photos, setPhotos] = useState<FileRecord[]>([]);
  const [months, setMonths] = useState<PhotoMonthBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [currentVisibleMonth, setCurrentVisibleMonth] = useState<string>('September 2026');
  const [activeFilter, setActiveFilter] = useState<'all' | 'photos' | 'videos' | 'favorites'>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const { syncStatus, isSyncing, triggerSync } = useSyncStatus();
  const accountSyncInfo = syncStatus?.accounts[0] ?? null;
  const fileCount = accountSyncInfo?.fileCount ?? 0;
  const syncDone = accountSyncInfo?.fullSyncStage === 'done';

  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // Load photos and timeline months from SQLite
  useEffect(() => {
    let isCancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        const [photosRes, monthsRes] = await Promise.all([
          getPhotos({ limit: 300 }),
          getPhotoMonths(),
        ]);
        if (!isCancelled) {
          setPhotos(photosRes.files);
          setMonths(monthsRes.months);
          if (monthsRes.months.length > 0 && monthsRes.months[0]) {
            setCurrentVisibleMonth(monthsRes.months[0].label);
          }
        }
      } catch {
        // fallback
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    void loadData();

    return () => {
      isCancelled = true;
    };
  }, [syncDone]);

  // SSE subscription to refresh photos if sync finishes
  useEffect(() => {
    if (!isSyncing) return;
    const unsub = subscribeSyncProgress((event) => {
      if (event.type === 'done') {
        void getPhotos({ limit: 300 }).then((res) => setPhotos(res.files));
        void getPhotoMonths().then((res) => setMonths(res.months));
      }
    });
    return unsub;
  }, [isSyncing]);

  // Filter items
  const filteredPhotos = useMemo(() => {
    if (activeFilter === 'photos') {
      return photos.filter((p) => p.mime_type.startsWith('image/'));
    }
    if (activeFilter === 'videos') {
      return photos.filter((p) => p.mime_type.startsWith('video/'));
    }
    if (activeFilter === 'favorites') {
      return photos.filter((p) => p.starred === 1);
    }
    return photos;
  }, [photos, activeFilter]);

  // Group photos by Month Year
  const groupedSections = useMemo(() => {
    const groups = new Map<string, FileRecord[]>();

    for (const photo of filteredPhotos) {
      const time = photo.taken_at || photo.modified_at;
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
  }, [filteredPhotos]);

  // Distinct years for the right rail scrubber
  const timelineYears = useMemo(() => {
    const yearSet = new Set<number>();
    months.forEach((m) => yearSet.add(m.year));
    if (yearSet.size === 0) {
      return [2026, 2025, 2024, 2023, 2022];
    }
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [months]);

  // IntersectionObserver to update floating month badge as user scrolls
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const month = entry.target.getAttribute('data-month');
            if (month) setCurrentVisibleMonth(month);
          }
        }
      },
      { root: containerRef.current, threshold: 0.2 },
    );

    sectionRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [groupedSections]);

  function scrollToSection(monthLabel: string) {
    const target = sectionRefs.current.get(monthLabel);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function handleZoomIn() {
    setZoom((z) => (Math.min(4, z + 1) as ZoomLevel));
  }

  function handleZoomOut() {
    setZoom((z) => (Math.max(1, z - 1) as ZoomLevel));
  }

  const subTabs = [
    { id: 'moments', label: 'Moments', icon: Clock },
    { id: 'gallery', label: 'Gallery', icon: Grid },
    { id: 'albums', label: 'Albums', icon: Layers },
    { id: 'favorites', label: 'Favorites', icon: Heart },
    { id: 'people', label: 'People', icon: Users },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#08080a] text-ds-text-primary relative select-none">
      {/* OneDrive Floating Header Controls */}
      <div className="sticky top-0 z-30 px-6 py-3 flex items-center justify-between pointer-events-none">
        {/* Left: Floating Month/Year Dynamic Pill */}
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="glass bg-zinc-950/80 border border-white/10 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide text-white shadow-xl flex items-center gap-2 backdrop-blur-xl">
            <Calendar size={13} className="text-brand opacity-90" />
            <span>{currentVisibleMonth}</span>
          </div>

          {/* Sub-tab pills */}
          <div className="hidden md:flex items-center gap-1 bg-zinc-950/70 p-1 rounded-full border border-white/10 backdrop-blur-xl">
            {subTabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => onTabChange?.(id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  activeTab === id
                    ? 'bg-brand text-white shadow-sm font-semibold'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Center: Gallery Pill */}
        <div className="hidden lg:flex pointer-events-auto items-center gap-2 glass bg-zinc-950/80 border border-white/10 px-4 py-1.5 rounded-full text-xs font-bold tracking-wide text-white shadow-xl backdrop-blur-xl">
          <Grid size={13} className="text-brand" />
          <span>Gallery</span>
        </div>

        {/* Right: Circular Action Buttons (Matching Screenshot 2) */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Filter button */}
          <div className="relative">
            <button
              onClick={() => setShowFilterMenu((s) => !s)}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all bg-zinc-900/90 border ${
                activeFilter !== 'all'
                  ? 'border-brand text-brand ring-2 ring-brand/30'
                  : 'border-white/10 text-zinc-300 hover:text-white hover:border-white/30'
              } shadow-lg active:scale-95`}
              title="Filter media"
            >
              <Filter size={15} />
            </button>

            {showFilterMenu && (
              <div className="absolute right-0 mt-2 w-40 rounded-xl bg-zinc-950 border border-white/10 shadow-2xl p-1 z-40 text-xs flex flex-col gap-0.5">
                {(['all', 'photos', 'videos', 'favorites'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => {
                      setActiveFilter(f);
                      setShowFilterMenu(false);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-left capitalize transition-colors ${
                      activeFilter === f
                        ? 'bg-brand text-white font-medium'
                        : 'text-zinc-300 hover:bg-white/10'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Adjust / Layout toggles */}
          <button
            onClick={() => setActiveFilter(activeFilter === 'favorites' ? 'all' : 'favorites')}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all bg-zinc-900/90 border ${
              activeFilter === 'favorites'
                ? 'border-rose-500 text-rose-500 ring-2 ring-rose-500/30'
                : 'border-white/10 text-zinc-300 hover:text-white hover:border-white/30'
            } shadow-lg active:scale-95`}
            title="Favorites"
          >
            <SlidersHorizontal size={15} />
          </button>

          {/* Zoom Out Minus */}
          <button
            onClick={handleZoomOut}
            disabled={zoom === 1}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all bg-zinc-900/90 border ${
              zoom === 1
                ? 'border-white/5 text-zinc-600 cursor-not-allowed'
                : 'border-white/10 text-zinc-300 hover:text-white hover:border-white/30 active:scale-95'
            } shadow-lg`}
            title="Zoom out (-)"
          >
            <Minus size={15} />
          </button>

          {/* Zoom In Plus */}
          <button
            onClick={handleZoomIn}
            disabled={zoom === 4}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all bg-zinc-900/90 border ${
              zoom === 4
                ? 'border-white/5 text-zinc-600 cursor-not-allowed'
                : 'border-white/10 text-zinc-300 hover:text-white hover:border-white/30 active:scale-95 ring-1 ring-white/10'
            } shadow-lg`}
            title="Zoom in (+)"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>

      {/* Main Gallery Scroll Viewport */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-6 sm:px-10 py-4 pb-24 relative scroll-smooth"
      >
        {/* Sync Prompt if not synced yet */}
        {!syncDone && fileCount === 0 && !loading && (
          <div className="card p-6 mb-8 max-w-xl mx-auto text-center border-brand/30 bg-gradient-to-b from-brand/10 to-transparent">
            <Sparkles size={28} className="text-brand mx-auto mb-3" />
            <h3 className="text-base font-bold text-white mb-1">Welcome to your Photo Gallery</h3>
            <p className="text-xs text-zinc-400 mb-4 max-w-md mx-auto">
              Sync your Google Drive to index all your photos and videos into high-speed local SQLite.
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

        {/* Loading Spinner */}
        {loading && photos.length === 0 && (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <Loader2 size={28} className="text-brand animate-spin" />
            <span className="text-xs text-zinc-500 font-mono tracking-wider">Loading library…</span>
          </div>
        )}

        {/* Grouped Month Sections with Smooth Scaling Gallery Cards */}
        {groupedSections.map(({ monthLabel, items }) => (
          <div
            key={monthLabel}
            ref={(el) => {
              if (el) sectionRefs.current.set(monthLabel, el);
              else sectionRefs.current.delete(monthLabel);
            }}
            data-month={monthLabel}
            className="mb-10"
          >
            {/* Section Month Header */}
            <div className="flex items-center justify-between mb-3.5 sticky top-14 z-10 py-1 bg-[#08080a]/90 backdrop-blur-md">
              <h3 className="text-sm font-semibold tracking-wide text-zinc-200">
                {monthLabel}
              </h3>
              <span className="text-[11px] font-mono text-zinc-500">
                {items.length} {items.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            {/* Photo Grid with fluid layout transition */}
            <div
              className={`grid gap-2 transition-all duration-300 ease-out ${
                ZOOM_CONFIGS[zoom].cols
              }`}
            >
              {items.map((file) => {
                const isVideo = file.mime_type.startsWith('video/');
                const globalIndex = filteredPhotos.indexOf(file);

                return (
                  <div
                    key={file.id}
                    onClick={() => setLightboxIndex(globalIndex)}
                    className={`group relative rounded-xl overflow-hidden bg-zinc-900 border border-white/5 cursor-pointer transition-all duration-300 hover:border-brand/60 hover:scale-[1.02] hover:z-20 hover:shadow-2xl ${
                      ZOOM_CONFIGS[zoom].aspect
                    }`}
                  >
                    {/* Thumbnail Image with lazy load */}
                    <img
                      src={getMediaThumbUrl(file.id, ZOOM_CONFIGS[zoom].size)}
                      alt={file.name}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={(e) => {
                        // Fallback icon placeholder if image fails
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.parentElement?.classList.add('flex', 'items-center', 'justify-center', 'bg-zinc-800');
                      }}
                    />

                    {/* Gradient Overlay on Hover */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-2.5">
                      {/* Top Badges */}
                      <div className="flex items-center justify-between">
                        {file.starred === 1 ? (
                          <span className="p-1 rounded-full bg-rose-500/30 text-rose-400 backdrop-blur-md">
                            <Heart size={12} fill="currentColor" />
                          </span>
                        ) : <div />}
                        {isVideo && (
                          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-white font-mono">
                            <Play size={9} fill="currentColor" /> Video
                          </span>
                        )}
                      </div>

                      {/* Bottom Info Title on Zoom 3 or 4 */}
                      <div className="truncate">
                        <p className="text-[11px] font-medium text-white truncate drop-shadow-sm">
                          {file.name}
                        </p>
                        {zoom >= 3 && file.camera_model && (
                          <p className="text-[9px] text-zinc-300 font-mono truncate">
                            {file.camera_model}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Center Video Indicator */}
                    {isVideo && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none group-hover:opacity-0 transition-opacity">
                        <div className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/90">
                          <Play size={13} fill="currentColor" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Right Timeline Year Scrubber Rail (Matches Screenshot 1) */}
      <div className="absolute right-2 top-24 bottom-24 w-8 flex flex-col items-center justify-between pointer-events-auto z-20 py-2 select-none">
        <span className="text-[10px] font-mono font-bold text-zinc-400">
          {timelineYears[0] ?? 2026}
        </span>

        <div className="flex flex-col items-center gap-2.5 my-auto">
          {timelineYears.map((yr) => (
            <button
              key={yr}
              onClick={() => {
                const targetMonth = months.find((m) => m.year === yr);
                if (targetMonth) scrollToSection(targetMonth.label);
              }}
              className="group relative flex items-center justify-center"
              title={`Jump to ${yr}`}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-600 group-hover:bg-brand group-hover:scale-150 transition-all" />
              <span className="absolute right-4 px-2 py-0.5 rounded bg-zinc-900 border border-white/10 text-[10px] font-mono text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg whitespace-nowrap">
                {yr}
              </span>
            </button>
          ))}
        </div>

        <span className="text-[10px] font-mono text-zinc-600">
          {timelineYears[timelineYears.length - 1] ?? 2020}
        </span>
      </div>

      {/* Floating Bottom Pill: Search & Quick Add (Matches Screenshot 1) */}
      <div className="absolute bottom-6 inset-x-0 flex justify-center pointer-events-none z-30">
        <div className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full glass bg-zinc-950/90 border border-white/10 shadow-2xl backdrop-blur-xl">
          <button
            onClick={() => setActiveFilter(activeFilter === 'photos' ? 'all' : 'photos')}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
              activeFilter === 'photos' ? 'bg-brand text-white' : 'text-zinc-400 hover:text-white'
            }`}
            title="Photos"
          >
            <ImageIcon size={14} />
          </button>
          <div className="w-px h-3.5 bg-white/10" />
          <button
            onClick={() => setActiveFilter(activeFilter === 'videos' ? 'all' : 'videos')}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
              activeFilter === 'videos' ? 'bg-brand text-white' : 'text-zinc-400 hover:text-white'
            }`}
            title="Videos"
          >
            <Play size={14} />
          </button>
        </div>
      </div>

      {/* Full Lightbox Modal */}
      {lightboxIndex !== null && (
        <PhotoLightbox
          files={filteredPhotos}
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
