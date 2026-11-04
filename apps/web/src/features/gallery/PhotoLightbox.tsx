import { useState, useEffect, useCallback } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Heart,
  Download,
  ExternalLink,
  Info,
  Maximize2,
  Minimize2,
  Camera,
  Calendar,
  HardDrive,
  FileText,
  Play,
  RotateCw,
} from 'lucide-react';
import type { FileRecord } from '../../lib/api';
import { getMediaThumbUrl, getMediaStreamUrl, getMediaDownloadUrl, updateFile } from '../../lib/api';

interface PhotoLightboxProps {
  files: FileRecord[];
  initialIndex: number;
  onClose: () => void;
  onFileUpdated?: (updated: FileRecord) => void;
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

function formatFullDate(ms: number | null): string {
  if (!ms) return 'Unknown date';
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PhotoLightbox({
  files,
  initialIndex,
  onClose,
  onFileUpdated,
}: PhotoLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showInfo, setShowInfo] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [rotation, setRotation] = useState(0);

  const file = files[currentIndex];
  const isVideo = file?.mime_type?.startsWith('video/') ?? false;

  const goToNext = useCallback(() => {
    if (currentIndex < files.length - 1) {
      setCurrentIndex((i) => i + 1);
      setIsZoomed(false);
      setRotation(0);
    }
  }, [currentIndex, files.length]);

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setIsZoomed(false);
      setRotation(0);
    }
  }, [currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') goToNext();
      else if (e.key === 'ArrowLeft') goToPrev();
      else if (e.key === 'i' || e.key === 'I') setShowInfo((s) => !s);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, goToNext, goToPrev]);

  if (!file) return null;

  async function handleToggleFavorite() {
    if (!file) return;
    const newStarred = file.starred === 1 ? 0 : 1;
    try {
      const res = await updateFile(file.id, { starred: newStarred });
      if (res.ok && onFileUpdated) {
        onFileUpdated({ ...file, starred: newStarred });
      }
    } catch {
      // optimistic update fallback
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch bg-black/95 backdrop-blur-2xl text-white select-none transition-all duration-300">
      {/* Main View Area */}
      <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
        {/* Top Floating Control Bar */}
        <div className="absolute top-0 inset-x-0 z-20 px-6 py-4 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent">
          {/* File info pill */}
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center transition-all text-white/90"
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
            <div className="flex flex-col">
              <span className="text-sm font-semibold truncate max-w-sm tracking-wide text-white">
                {file.name}
              </span>
              <span className="text-[11px] text-white/60 font-mono">
                {currentIndex + 1} of {files.length} • {formatFullDate(file.taken_at || file.modified_at)}
              </span>
            </div>
          </div>

          {/* Action icons */}
          <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md px-2 py-1 rounded-full border border-white/10 shadow-lg">
            {/* Star / Favorite */}
            <button
              onClick={handleToggleFavorite}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                file.starred === 1
                  ? 'text-rose-500 bg-rose-500/20'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
              title={file.starred === 1 ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Heart size={16} fill={file.starred === 1 ? 'currentColor' : 'none'} />
            </button>

            {/* Rotate */}
            {!isVideo && (
              <button
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="w-8 h-8 rounded-full text-white/80 hover:text-white hover:bg-white/10 flex items-center justify-center transition-all"
                title="Rotate (90°)"
              >
                <RotateCw size={15} />
              </button>
            )}

            {/* Zoom toggle */}
            {!isVideo && (
              <button
                onClick={() => setIsZoomed((z) => !z)}
                className="w-8 h-8 rounded-full text-white/80 hover:text-white hover:bg-white/10 flex items-center justify-center transition-all"
                title={isZoomed ? 'Fit to screen' : 'Zoom 100%'}
              >
                {isZoomed ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            )}

            {/* Download */}
            <a
              href={getMediaDownloadUrl(file.id)}
              download
              className="w-8 h-8 rounded-full text-white/80 hover:text-white hover:bg-white/10 flex items-center justify-center transition-all"
              title="Download file"
            >
              <Download size={15} />
            </a>

            {/* Open in Google Drive */}
            {file.web_view_link && (
              <a
                href={file.web_view_link}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-full text-white/80 hover:text-white hover:bg-white/10 flex items-center justify-center transition-all"
                title="Open original in Google Drive"
              >
                <ExternalLink size={15} />
              </a>
            )}

            {/* Info toggle */}
            <button
              onClick={() => setShowInfo((s) => !s)}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                showInfo
                  ? 'bg-brand text-white'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
              title="File details (I)"
            >
              <Info size={15} />
            </button>
          </div>
        </div>

        {/* Media Canvas Area */}
        <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden">
          {isVideo ? (
            /* Phase 4: High performance video streaming with seek range support */
            <div className="relative max-h-[85vh] max-w-[85vw] flex items-center justify-center">
              <video
                controls
                autoPlay
                playsInline
                src={getMediaStreamUrl(file.id)}
                className="max-h-[82vh] max-w-[85vw] rounded-xl shadow-2xl bg-black border border-white/10 outline-none"
              >
                Your browser does not support HTML5 video streaming.
              </video>
            </div>
          ) : (
            /* Phase 3: High resolution photo presentation */
            <div
              className={`relative transition-transform duration-200 cursor-zoom-in ${
                isZoomed ? 'scale-150 cursor-zoom-out' : ''
              }`}
              onClick={() => setIsZoomed((z) => !z)}
              style={{ transform: `rotate(${rotation}deg)` }}
            >
              <img
                src={getMediaThumbUrl(file.id, 1600)}
                alt={file.name}
                className="max-h-[82vh] max-w-[85vw] object-contain rounded-lg shadow-2xl transition-all duration-300"
                loading="eager"
              />
            </div>
          )}

          {/* Previous arrow */}
          {currentIndex > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                goToPrev();
              }}
              className="absolute left-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/40 hover:bg-white/20 active:scale-95 text-white/80 hover:text-white flex items-center justify-center backdrop-blur-md border border-white/10 transition-all z-10 shadow-xl"
              title="Previous (Left arrow)"
            >
              <ChevronLeft size={24} />
            </button>
          )}

          {/* Next arrow */}
          {currentIndex < files.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                goToNext();
              }}
              className="absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/40 hover:bg-white/20 active:scale-95 text-white/80 hover:text-white flex items-center justify-center backdrop-blur-md border border-white/10 transition-all z-10 shadow-xl"
              title="Next (Right arrow)"
            >
              <ChevronRight size={24} />
            </button>
          )}
        </div>

        {/* Bottom Thumbnail Strip */}
        <div className="h-16 px-6 py-2 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-center gap-2 overflow-x-auto z-10">
          {files.slice(Math.max(0, currentIndex - 5), currentIndex + 6).map((f) => {
            const idx = files.indexOf(f);
            const active = idx === currentIndex;
            return (
              <button
                key={f.id}
                onClick={() => {
                  setCurrentIndex(idx);
                  setIsZoomed(false);
                  setRotation(0);
                }}
                className={`h-12 w-12 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 relative ${
                  active
                    ? 'border-brand scale-110 shadow-md ring-2 ring-brand/40'
                    : 'border-white/20 opacity-50 hover:opacity-100 hover:border-white/50'
                }`}
              >
                <img
                  src={getMediaThumbUrl(f.id, 100)}
                  alt={f.name}
                  className="w-full h-full object-cover"
                />
                {f.mime_type.startsWith('video/') && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Play size={10} className="text-white fill-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Side Info / EXIF Panel */}
      {showInfo && (
        <div className="w-80 border-l border-white/10 bg-zinc-950/90 backdrop-blur-xl p-6 flex flex-col gap-6 overflow-y-auto animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <h3 className="font-semibold text-sm tracking-wide text-white">Details & EXIF</h3>
            <button
              onClick={() => setShowInfo(false)}
              className="text-white/60 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-all"
            >
              <X size={16} />
            </button>
          </div>

          {/* Camera & Shooting info */}
          <div className="flex flex-col gap-3">
            <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">
              Capture Information
            </span>

            <div className="flex items-start gap-3 text-xs">
              <Camera size={16} className="text-brand flex-shrink-0 mt-0.5" />
              <div className="flex flex-col">
                <span className="font-medium text-white/90">
                  {file.camera_make || file.camera_model
                    ? `${file.camera_make ?? ''} ${file.camera_model ?? ''}`.trim()
                    : 'Device camera details unavailable'}
                </span>
                <span className="text-white/50 text-[11px] mt-0.5">
                  {file.image_width && file.image_height
                    ? `${file.image_width} × ${file.image_height} px`
                    : 'Resolution metadata in Drive'}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3 text-xs">
              <Calendar size={16} className="text-brand flex-shrink-0 mt-0.5" />
              <div className="flex flex-col">
                <span className="font-medium text-white/90">
                  {formatFullDate(file.taken_at || file.modified_at)}
                </span>
                <span className="text-white/50 text-[11px] mt-0.5">
                  {file.taken_at ? 'Captured timestamp (EXIF)' : 'Drive file modified date'}
                </span>
              </div>
            </div>
          </div>

          {/* File attributes */}
          <div className="flex flex-col gap-3 pt-4 border-t border-white/10">
            <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">
              File Properties
            </span>

            <div className="flex items-start gap-3 text-xs">
              <HardDrive size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="flex flex-col">
                <span className="font-medium text-white/90">{formatBytes(file.size_bytes)}</span>
                <span className="text-white/50 text-[11px] mt-0.5">{file.mime_type}</span>
              </div>
            </div>

            <div className="flex items-start gap-3 text-xs">
              <FileText size={16} className="text-indigo-400 flex-shrink-0 mt-0.5" />
              <div className="flex flex-col overflow-hidden">
                <span className="font-medium text-white/90 truncate">{file.name}</span>
                <span className="text-white/40 text-[10px] font-mono mt-0.5 truncate">
                  ID: {file.id}
                </span>
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="mt-auto pt-4 border-t border-white/10 flex items-center justify-between text-xs text-white/50">
            <span>Status</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-[10px]">
              Indexed in SQLite
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
