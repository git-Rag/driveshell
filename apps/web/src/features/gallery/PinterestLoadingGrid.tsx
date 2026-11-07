import { RefreshCw, Image as ImageIcon, Film } from 'lucide-react';

interface PinterestLoadingGridProps {
  isSyncing?: boolean;
}

export function PinterestLoadingGrid({ isSyncing = false }: PinterestLoadingGridProps) {
  // Staggered aspect ratios creating an organic Pinterest masonry waterfall
  const col1Ratios = [
    'aspect-[3/4]',
    'aspect-[1/1]',
    'aspect-[4/5]',
    'aspect-[16/9]',
    'aspect-[3/4]',
    'aspect-[1/1]',
  ];

  const col2Ratios = [
    'aspect-[1/1]',
    'aspect-[3/5]',
    'aspect-[4/3]',
    'aspect-[3/4]',
    'aspect-[1/1]',
    'aspect-[4/5]',
  ];

  const col3Ratios = [
    'aspect-[4/5]',
    'aspect-[3/4]',
    'aspect-[1/1]',
    'aspect-[3/5]',
    'aspect-[16/10]',
    'aspect-[3/4]',
  ];

  return (
    <div className="w-full flex flex-col items-center animate-in fade-in duration-300">
      {/* Floating status badge */}
      <div className="inline-flex items-center gap-2.5 px-4 py-2 my-4 rounded-full bg-zinc-900/90 border border-white/10 shadow-xl backdrop-blur-md">
        <RefreshCw size={13} className="text-brand animate-spin" />
        <span className="text-xs font-medium text-zinc-300">
          {isSyncing ? 'Syncing your Google Drive media…' : 'Loading your photo library…'}
        </span>
      </div>

      {/* Staggered Pinterest Masonry Grid */}
      <div className="w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 px-1 pb-16">
        {/* Column 1 */}
        <div className="flex flex-col gap-3">
          {col1Ratios.map((aspect, idx) => (
            <div
              key={`c1-${idx}`}
              className={`w-full rounded-2xl overflow-hidden relative bg-gradient-to-br from-zinc-900 via-zinc-800/60 to-zinc-900/90 border border-white/10 shadow-md ${aspect} animate-pulse`}
              style={{ animationDelay: `${idx * 120}ms` }}
            >
              <div className="absolute inset-0 flex items-center justify-center opacity-15">
                {idx % 3 === 1 ? (
                  <Film size={24} className="text-brand" />
                ) : (
                  <ImageIcon size={24} className="text-brand" />
                )}
              </div>
              <div className="absolute bottom-3 left-3 w-16 h-2.5 rounded-full bg-white/10" />
            </div>
          ))}
        </div>

        {/* Column 2 */}
        <div className="flex flex-col gap-3">
          {col2Ratios.map((aspect, idx) => (
            <div
              key={`c2-${idx}`}
              className={`w-full rounded-2xl overflow-hidden relative bg-gradient-to-br from-zinc-900 via-zinc-800/60 to-zinc-900/90 border border-white/10 shadow-md ${aspect} animate-pulse`}
              style={{ animationDelay: `${idx * 120 + 180}ms` }}
            >
              <div className="absolute inset-0 flex items-center justify-center opacity-15">
                {idx % 2 === 0 ? (
                  <ImageIcon size={24} className="text-brand" />
                ) : (
                  <Film size={24} className="text-brand" />
                )}
              </div>
              <div className="absolute bottom-3 left-3 w-20 h-2.5 rounded-full bg-white/10" />
            </div>
          ))}
        </div>

        {/* Column 3 (visible on sm+) */}
        <div className="hidden sm:flex flex-col gap-3">
          {col3Ratios.map((aspect, idx) => (
            <div
              key={`c3-${idx}`}
              className={`w-full rounded-2xl overflow-hidden relative bg-gradient-to-br from-zinc-900 via-zinc-800/60 to-zinc-900/90 border border-white/10 shadow-md ${aspect} animate-pulse`}
              style={{ animationDelay: `${idx * 120 + 300}ms` }}
            >
              <div className="absolute inset-0 flex items-center justify-center opacity-15">
                <ImageIcon size={24} className="text-brand" />
              </div>
              <div className="absolute bottom-3 left-3 w-14 h-2.5 rounded-full bg-white/10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
