import { useState } from 'react';
import {
  Calendar,
  Grid,
  Heart,
  SlidersHorizontal,
  RefreshCw,
  Sparkles,
  Maximize2,
  FolderOpen,
  CheckCircle2,
  Image as ImageIcon,
  Clock,
  Layers,
  Users,
} from 'lucide-react';
import type { AccountSummary } from '../../lib/api';

interface GalleryViewProps {
  account?: AccountSummary | null;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export function GalleryView({ account, activeTab = 'gallery', onTabChange }: GalleryViewProps) {
  const [selectedYear, setSelectedYear] = useState('All');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [previewPhoto, setPreviewPhoto] = useState<number | null>(null);

  const years = ['All', '2026', '2025', '2024', '2023', 'Older'];

  // Sample visual layout cards demonstrating the photo grid feel
  const sampleItems = [
    {
      id: 1,
      title: 'DSC_4821.jpg',
      date: 'Today, 2:15 PM',
      ratio: 'aspect-[4/3]',
      tag: 'Camera',
      gradient: 'from-blue-600/30 to-violet-600/30',
      dims: '4032 × 3024',
      size: '4.2 MB',
    },
    {
      id: 2,
      title: 'Mountain_Sunrise.png',
      date: 'Yesterday, 6:40 AM',
      ratio: 'aspect-[16/9]',
      tag: 'Scenery',
      gradient: 'from-amber-500/30 to-rose-600/30',
      dims: '5120 × 2880',
      size: '8.7 MB',
    },
    {
      id: 3,
      title: 'IMG_9024.heic',
      date: 'Nov 2, 2026',
      ratio: 'aspect-[3/4]',
      tag: 'Portrait',
      gradient: 'from-emerald-500/30 to-teal-700/30',
      dims: '3024 × 4032',
      size: '3.1 MB',
    },
    {
      id: 4,
      title: 'Screenshot_2026-11-01.png',
      date: 'Nov 1, 2026',
      ratio: 'aspect-[16/10]',
      tag: 'Screenshot',
      gradient: 'from-indigo-600/30 to-cyan-600/30',
      dims: '2560 × 1600',
      size: '1.4 MB',
    },
    {
      id: 5,
      title: 'Studio_Shoot_08.jpg',
      date: 'Oct 28, 2026',
      ratio: 'aspect-square',
      tag: 'People',
      gradient: 'from-fuchsia-600/30 to-purple-800/30',
      dims: '3840 × 3840',
      size: '6.5 MB',
    },
    {
      id: 6,
      title: 'Architectural_Draft.jpg',
      date: 'Oct 25, 2026',
      ratio: 'aspect-[3/2]',
      tag: 'Design',
      gradient: 'from-zinc-700/40 to-slate-800/40',
      dims: '6000 × 4000',
      size: '12.1 MB',
    },
  ];

  const subTabs = [
    { id: 'moments', label: 'Moments', icon: Clock },
    { id: 'gallery', label: 'Gallery', icon: Grid },
    { id: 'albums', label: 'Albums', icon: Layers },
    { id: 'favorites', label: 'Favorites', icon: Heart },
    { id: 'people', label: 'People', icon: Users },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-ds-bg text-ds-text-primary">
      {/* Sub-navigation & Toolbar */}
      <div className="sticky top-0 z-20 glass border-b border-ds-border px-6 py-2.5 flex items-center justify-between gap-4">
        {/* Photo Subtabs */}
        <div className="flex items-center gap-1 bg-ds-bg-elevated p-1 rounded-lg border border-ds-border/60">
          {subTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onTabChange?.(id)}
              className={[
                'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all',
                activeTab === id
                  ? 'bg-ds-bg-raised text-ds-text-primary shadow-sm border border-ds-border/60'
                  : 'text-ds-text-secondary hover:text-ds-text-primary hover:bg-ds-bg-hover',
              ].join(' ')}
            >
              <Icon size={13} className={activeTab === id ? 'text-brand' : 'opacity-70'} />
              {label}
            </button>
          ))}
        </div>

        {/* Date Jump Picker */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-ds-bg-elevated px-2 py-1 rounded-lg border border-ds-border/60 text-xs text-ds-text-secondary">
            <Calendar size={13} className="text-brand opacity-80" />
            <span className="font-semibold mr-1">Jump:</span>
            {years.map((yr) => (
              <button
                key={yr}
                onClick={() => setSelectedYear(yr)}
                className={[
                  'px-2 py-0.5 rounded text-xs transition-colors',
                  selectedYear === yr
                    ? 'bg-brand text-white font-semibold'
                    : 'hover:text-ds-text-primary',
                ].join(' ')}
              >
                {yr}
              </button>
            ))}
          </div>

          {/* Grid density toggle */}
          <div className="flex items-center bg-ds-bg-elevated p-1 rounded-lg border border-ds-border/60">
            <button
              onClick={() => setDensity('comfortable')}
              className={[
                'p-1 rounded text-xs transition-colors',
                density === 'comfortable'
                  ? 'bg-ds-bg-raised text-ds-text-primary'
                  : 'text-ds-text-muted hover:text-ds-text-secondary',
              ].join(' ')}
              title="Comfortable grid"
            >
              <Grid size={14} />
            </button>
            <button
              onClick={() => setDensity('compact')}
              className={[
                'p-1 rounded text-xs transition-colors',
                density === 'compact'
                  ? 'bg-ds-bg-raised text-ds-text-primary'
                  : 'text-ds-text-muted hover:text-ds-text-secondary',
              ].join(' ')}
              title="Compact grid"
            >
              <SlidersHorizontal size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* Phase 2 Ready Banner */}
        <div className="card p-5 mb-8 bg-gradient-to-r from-blue-950/20 via-zinc-900 to-violet-950/20 border-brand/20">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <CheckCircle2 size={20} className="text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-semibold text-ds-text-primary">
                    Google Drive Connected
                  </h3>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Phase 1 Complete
                  </span>
                </div>
                <p className="text-xs text-ds-text-secondary max-w-xl leading-relaxed">
                  Authenticated as{' '}
                  <strong className="text-ds-text-primary">
                    {account?.displayName ?? 'Your Google Account'}
                  </strong>{' '}
                  ({account?.email}). OAuth refresh tokens are safely stored in your native OS
                  keychain.
                </p>
                <div className="flex items-center gap-3 mt-3 text-xs text-ds-text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles size={13} className="text-brand" />
                    <strong>Next (Phase 2):</strong> Drive Sync Engine indexes your photos into
                    local SQLite.
                  </span>
                  <span>•</span>
                  <span>
                    <strong>Phase 3:</strong> 60 fps virtualized photo grid + lightbox viewer.
                  </span>
                </div>
              </div>
            </div>

            <button
              disabled
              className="btn-primary opacity-60 cursor-not-allowed flex items-center gap-2 text-xs py-2 px-3.5 flex-shrink-0"
              title="Sync Engine will be built in Phase 2"
            >
              <RefreshCw size={13} />
              Drive Sync (Phase 2)
            </button>
          </div>
        </div>

        {/* Section Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-baseline gap-2.5">
            <h2 className="text-lg font-bold tracking-tight capitalize text-ds-text-primary">
              {activeTab}
            </h2>
            <span className="text-xs text-ds-text-muted">Preview layout</span>
          </div>
          <span className="text-xs font-mono text-ds-text-muted">
            {sampleItems.length} preview items
          </span>
        </div>

        {/* Photo Grid Preview */}
        <div
          className={[
            'grid gap-4 transition-all duration-200',
            density === 'comfortable'
              ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
              : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6',
          ].join(' ')}
        >
          {sampleItems.map((item) => (
            <div
              key={item.id}
              onClick={() => setPreviewPhoto(previewPhoto === item.id ? null : item.id)}
              className={[
                'group relative rounded-xl overflow-hidden border border-ds-border bg-ds-bg-raised transition-all duration-200 cursor-pointer hover:border-brand/50 hover:shadow-lg',
                previewPhoto === item.id ? 'ring-2 ring-brand border-transparent' : '',
              ].join(' ')}
            >
              {/* Photo Canvas Simulation */}
              <div
                className={[
                  'w-full bg-gradient-to-br flex flex-col justify-between p-3.5 relative overflow-hidden',
                  item.ratio,
                  item.gradient,
                ].join(' ')}
              >
                {/* Backdrop Pattern */}
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:12px_12px]" />

                {/* Top Badge & Favorite button */}
                <div className="relative z-10 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-md text-white/90">
                    {item.tag}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    className="w-7 h-7 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white/80 hover:text-rose-400 hover:scale-110 transition-all"
                  >
                    <Heart size={13} />
                  </button>
                </div>

                {/* Center Icon */}
                <div className="relative z-10 flex items-center justify-center my-auto opacity-40 group-hover:opacity-70 group-hover:scale-105 transition-all">
                  <ImageIcon size={32} className="text-white" />
                </div>

                {/* Bottom Overlay Info */}
                <div className="relative z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="bg-black/60 backdrop-blur-md px-2.5 py-1.5 rounded-lg text-white">
                    <p className="text-xs font-semibold truncate">{item.title}</p>
                    <p className="text-[10px] text-white/70 font-mono mt-0.5">
                      {item.dims} • {item.size}
                    </p>
                  </div>
                </div>
              </div>

              {/* Bottom Card Footer */}
              <div className="p-2.5 bg-ds-bg-raised border-t border-ds-border/40 flex items-center justify-between text-xs">
                <span className="font-medium text-ds-text-primary truncate max-w-[140px]">
                  {item.title}
                </span>
                <span className="text-[11px] text-ds-text-muted whitespace-nowrap">
                  {item.date}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
