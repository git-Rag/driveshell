import { useState, useEffect, useCallback, useRef } from 'react';
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
  FolderPlus,
  Check,
  Plus,
  Film,
  Zap,
  Loader2,
} from 'lucide-react';
import type { FileRecord, Album } from '../../lib/api';
import { MediaThumbnail } from './MediaThumbnail';
import { registerBackButtonHandler } from '../../lib/back-button';
import {
  getMediaThumbUrl,
  getMediaStreamUrl,
  triggerFileDownload,
  updateFile,
  listAlbums,
  createAlbum,
  addItemsToAlbum,
  transcodeVideo,
} from '../../lib/api';

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

// Session cache to prevent re-requesting failed video streams
const failedVideoPlaybackSet = new Set<string>();

export function isVideoPlaybackFailed(fileId: string): boolean {
  return failedVideoPlaybackSet.has(fileId);
}

export function markVideoPlaybackFailed(fileId: string): void {
  failedVideoPlaybackSet.add(fileId);
}

export function detectProbableCodec(fileName: string, mimeType: string): string {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.mts') || lowerName.endsWith('.m2ts')) {
    return 'MPEG-2 Transport Stream (AVCHD)';
  }
  if (lowerName.includes('snapchat') || lowerName.endsWith('.mp4')) {
    return 'HEVC / H.265';
  }
  if (lowerName.endsWith('.mov') || mimeType === 'video/quicktime') {
    return 'Apple ProRes / HEVC';
  }
  return 'HEVC / H.265 or Unsupported Codec';
}

export function PhotoLightbox({ files, initialIndex, onClose, onFileUpdated }: PhotoLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showInfo, setShowInfo] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [highResLoaded, setHighResLoaded] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  // Sync fullscreen state with document.fullscreenElement
  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, []);

  // Album Picker modal state
  const [showAlbumPicker, setShowAlbumPicker] = useState(false);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loadingAlbums, setLoadingAlbums] = useState(false);
  const [newAlbumTitle, setNewAlbumTitle] = useState('');
  const [showCreateInline, setShowCreateInline] = useState(false);
  const [addedAlbumId, setAddedAlbumId] = useState<string | null>(null);

  const file = files[currentIndex];
  const isVideo = file?.mime_type?.startsWith('video/') ?? false;
  const isExpanded = isFullscreen || isZoomed;
  const [videoFailed, setVideoFailed] = useState(false);
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [useTranscodeStream, setUseTranscodeStream] = useState<Record<string, boolean>>({});
  const videoRef = useRef<HTMLVideoElement>(null);

  // Sync failed video state on item switch
  useEffect(() => {
    setIsTranscoding(false);
    if (file) {
      setVideoFailed(isVideoPlaybackFailed(file.id));
    }
  }, [file, currentIndex]);

  // Pause and release video resources on index change or unmount
  useEffect(() => {
    const videoEl = videoRef.current;
    return () => {
      if (videoEl) {
        videoEl.pause();
        videoEl.removeAttribute('src');
        videoEl.load();
      }
    };
  }, [currentIndex]);

  // Volume & mute persistence across video sessions
  useEffect(() => {
    if (videoRef.current && isVideo) {
      const savedVol = localStorage.getItem('ds_video_volume');
      const savedMuted = localStorage.getItem('ds_video_muted');
      if (savedVol !== null) videoRef.current.volume = parseFloat(savedVol);
      if (savedMuted !== null) videoRef.current.muted = savedMuted === 'true';
    }
  }, [currentIndex, isVideo, videoFailed]);

  const handleVolumeChange = useCallback(() => {
    if (videoRef.current) {
      localStorage.setItem('ds_video_volume', videoRef.current.volume.toString());
      localStorage.setItem('ds_video_muted', videoRef.current.muted.toString());
    }
  }, []);

  const startTranscoding = useCallback(async (fileId: string) => {
    setIsTranscoding(true);
    setVideoFailed(false);
    try {
      const res = await transcodeVideo(fileId);
      if (res.ready) {
        setUseTranscodeStream((prev) => ({ ...prev, [fileId]: true }));
        setVideoFailed(false);
      } else {
        setVideoFailed(true);
      }
    } catch {
      setVideoFailed(true);
    } finally {
      setIsTranscoding(false);
    }
  }, []);

  const handleVideoError = useCallback(
    (fileId: string) => {
      if (isTranscoding) return;
      // When native playback is not supported by the browser, display the fallback
      // options panel (Transcode & Play, Open in Drive, Download)
      setIsTranscoding(false);
      markVideoPlaybackFailed(fileId);
      setVideoFailed(true);
    },
    [isTranscoding],
  );

  // Reset display states on image switch
  useEffect(() => {
    setHighResLoaded(false);
    setPhotoFailed(false);
    setIsZoomed(false);
    setRotation(0);
    setAddedAlbumId(null);
    setVideoFailed(false);
    setIsTranscoding(false);
  }, [currentIndex]);

  // Intelligent deferred pre-fetching: ONLY after the active photo is fully loaded
  // This ensures the clicked photo gets 100% network priority and is never blocked
  useEffect(() => {
    if (!highResLoaded) return;
    const timer = setTimeout(() => {
      const toPrefetch = [currentIndex + 1, currentIndex - 1, currentIndex + 2];
      for (const idx of toPrefetch) {
        if (idx >= 0 && idx < files.length) {
          const f = files[idx];
          if (f && !f.mime_type.startsWith('video/')) {
            const img = new Image();
            img.src = getMediaThumbUrl(f.id, 1200, f.account_id, f.thumbnail_url);
          }
        }
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [currentIndex, files, highResLoaded]);

  // Fullscreen and 1-click Download Handlers
  const handleToggleFullscreen = useCallback(async () => {
    const next = !isFullscreen;
    setIsFullscreen(next);
    if (!next) {
      setIsZoomed(false);
    }
    try {
      if (next) {
        const el = document.documentElement as HTMLElement & {
          webkitRequestFullscreen?: () => Promise<void>;
        };
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
        }
      } else {
        const doc = document as Document & {
          webkitExitFullscreen?: () => Promise<void>;
        };
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        }
      }
    } catch {
      // In webviews where requestFullscreen is not permitted, CSS expansion & scale provides fallback
    }
  }, [isFullscreen]);

  const handleDownload = useCallback(async () => {
    if (!file || isDownloading) return;
    setIsDownloading(true);
    try {
      await triggerFileDownload(file);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 2500);
    } catch (err) {
      console.error('Download failed', err);
      alert('Could not start download. Please check your network connection.');
    } finally {
      setIsDownloading(false);
    }
  }, [file, isDownloading]);

  // Android system back button listener — intercept so back closes viewer instead of quitting app
  useEffect(() => {
    return registerBackButtonHandler(() => {
      if (showAlbumPicker) {
        setShowAlbumPicker(false);
        return true;
      }
      if (showInfo) {
        setShowInfo(false);
        return true;
      }
      if (isFullscreen) {
        void handleToggleFullscreen();
        return true;
      }
      if (isZoomed) {
        setIsZoomed(false);
        return true;
      }
      onClose();
      return true;
    });
  }, [showAlbumPicker, showInfo, isFullscreen, isZoomed, handleToggleFullscreen, onClose]);

  const goToNext = useCallback(() => {
    if (currentIndex < files.length - 1) {
      setCurrentIndex((i) => i + 1);
    }
  }, [currentIndex, files.length]);

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  }, [currentIndex]);

  // Touch Swipe Gesture State & Handlers (smooth slide left/right)
  const [touchDeltaX, setTouchDeltaX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const hasSwipedRef = useRef(false);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (isZoomed || e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (touch) {
        touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
        setIsSwiping(true);
        hasSwipedRef.current = false;
      }
    },
    [isZoomed],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current || isZoomed || e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dx) > 10) {
          hasSwipedRef.current = true;
        }
        setTouchDeltaX(dx);
      }
    },
    [isZoomed],
  );

  const handleTouchEnd = useCallback(() => {
    if (!touchStartRef.current) return;
    const dx = touchDeltaX;
    const elapsed = Date.now() - touchStartRef.current.time;
    const velocity = Math.abs(dx) / (elapsed || 1);

    touchStartRef.current = null;
    setIsSwiping(false);
    setTouchDeltaX(0);

    const SWIPE_THRESHOLD = 50;
    const FAST_SWIPE_THRESHOLD = 25;

    if (dx < -SWIPE_THRESHOLD || (dx < -FAST_SWIPE_THRESHOLD && velocity > 0.3)) {
      goToNext();
    } else if (dx > SWIPE_THRESHOLD || (dx > FAST_SWIPE_THRESHOLD && velocity > 0.3)) {
      goToPrev();
    }
  }, [touchDeltaX, goToNext, goToPrev]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (showAlbumPicker) setShowAlbumPicker(false);
        else onClose();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      } else if (e.key === 'ArrowLeft') {
        goToPrev();
      } else if (e.key === 'i' || e.key === 'I') {
        setShowInfo((s) => !s);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, goToNext, goToPrev, showAlbumPicker]);

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

  async function handleOpenAlbumPicker() {
    setShowAlbumPicker(true);
    setLoadingAlbums(true);
    try {
      const res = await listAlbums();
      setAlbums(res.albums);
    } catch {
      // fallback
    } finally {
      setLoadingAlbums(false);
    }
  }

  async function handleAddToAlbum(albumId: string) {
    if (!file) return;
    try {
      await addItemsToAlbum(albumId, [file.id]);
      setAddedAlbumId(albumId);
      setTimeout(() => setShowAlbumPicker(false), 800);
    } catch (err) {
      console.error('Failed to add to album', err);
    }
  }

  async function handleCreateAndAdd() {
    if (!file || !newAlbumTitle.trim()) return;
    try {
      const res = await createAlbum(newAlbumTitle.trim(), undefined, [file.id]);
      setAlbums((prev) => [res.album, ...prev]);
      setAddedAlbumId(res.album.id);
      setNewAlbumTitle('');
      setShowCreateInline(false);
      setTimeout(() => setShowAlbumPicker(false), 800);
    } catch (err) {
      console.error('Failed to create album', err);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch bg-black/95 backdrop-blur-2xl text-white select-none transition-all duration-300">
      {/* Main View Area */}
      <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
        {/* Top Floating Control Bar */}
        <div
          className="absolute top-0 inset-x-0 z-20 px-4 sm:px-6 pt-12 sm:pt-6 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gradient-to-b from-black/90 via-black/60 to-transparent"
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 0px), 48px)',
            paddingLeft: 'max(env(safe-area-inset-left, 0px), 16px)',
            paddingRight: 'max(env(safe-area-inset-right, 0px), 16px)',
          }}
        >
          {/* File info pill */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center transition-all text-white/90 shrink-0"
              title="Close (Esc or Back)"
              aria-label="Close photo viewer"
            >
              <X size={18} />
            </button>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold truncate tracking-wide text-white">
                {file.name}
              </span>
              <span className="text-[11px] text-white/60 font-mono truncate">
                {currentIndex + 1} of {files.length} •{' '}
                {formatFullDate(file.taken_at ?? file.modified_at)}
              </span>
            </div>
          </div>

          {/* Action icons — on mobile sits directly below file info, on desktop sits on right */}
          <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-white/10 shadow-lg w-fit max-w-full overflow-x-auto no-scrollbar shrink-0 ml-12 sm:ml-0">
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

            {/* Add to Album */}
            <button
              onClick={handleOpenAlbumPicker}
              className="w-8 h-8 rounded-full text-white/80 hover:text-white hover:bg-white/10 flex items-center justify-center transition-all"
              title="Add to Album"
            >
              <FolderPlus size={15} />
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

            {/* Fullscreen / Expand toggle */}
            {!isVideo && (
              <button
                onClick={() => void handleToggleFullscreen()}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  isExpanded
                    ? 'bg-brand text-white shadow-md'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
                title={isExpanded ? 'Exit Fullscreen' : 'Fullscreen / Expand'}
                aria-label={isExpanded ? 'Exit Fullscreen' : 'Fullscreen / Expand'}
              >
                {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            )}

            {/* Download (1 click) */}
            <button
              onClick={() => void handleDownload()}
              disabled={isDownloading}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                downloadSuccess
                  ? 'text-emerald-400 bg-emerald-500/20'
                  : 'text-white/80 hover:text-white hover:bg-white/10 active:scale-95'
              }`}
              title={downloadSuccess ? 'Downloaded!' : 'Download file (1 click)'}
              aria-label="Download file"
            >
              {isDownloading ? (
                <Loader2 size={15} className="animate-spin text-brand" />
              ) : downloadSuccess ? (
                <Check size={15} className="text-emerald-400" />
              ) : (
                <Download size={15} />
              )}
            </button>

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

        {/* Media Canvas Area with Touch Swipe Support */}
        <div
          className="flex-1 flex items-center justify-center p-4 relative overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {isVideo &&
          (videoFailed || isVideoPlaybackFailed(file.id)) &&
          !useTranscodeStream[file.id] ? (
            /* Clear Unsupported Format Fallback Panel (Tier 1 & Tier 2) */
            <div
              data-testid="unsupported-video-panel"
              className="relative max-h-[82vh] max-w-xl w-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-zinc-950/90 flex flex-col items-center justify-center p-8 text-center"
            >
              {/* Drive thumbnail as blurred background if available */}
              {file.thumbnail_url && (
                <img
                  src={getMediaThumbUrl(file.id, 800, file.account_id, file.thumbnail_url)}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-cover opacity-20 filter blur-md pointer-events-none"
                />
              )}

              <div className="relative z-10 flex flex-col items-center max-w-md">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 shadow-lg">
                  <Film size={28} />
                </div>

                <h3 className="text-lg font-semibold text-white mb-1.5">
                  This browser can't play this video's format
                </h3>

                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2.5 py-0.5 rounded-full bg-zinc-800 border border-white/10 text-[11px] font-mono font-medium text-amber-300">
                    {detectProbableCodec(file.name, file.mime_type)}
                  </span>
                  <span className="text-xs text-zinc-400 truncate max-w-[200px]">
                    • {file.name}
                  </span>
                </div>

                <p className="text-xs text-zinc-300 leading-relaxed mb-6">
                  This video is encoded in a format that your current browser cannot decode
                  natively. You can transcode it on-the-fly to universal H.264, open it in Google
                  Drive, or download the original file.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    data-testid="transcode-play-btn"
                    onClick={() => {
                      void startTranscoding(file.id);
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95 transition-all shadow-md cursor-pointer"
                  >
                    <Zap size={14} />
                    Transcode &amp; Play (H.264)
                  </button>

                  {file.web_view_link && (
                    <a
                      href={file.web_view_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-brand text-white hover:opacity-90 active:scale-95 transition-all shadow-md"
                    >
                      <ExternalLink size={14} />
                      Open in Drive
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDownload()}
                    disabled={isDownloading}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium bg-white/10 hover:bg-white/20 text-white border border-white/10 active:scale-95 transition-all shadow-md cursor-pointer"
                  >
                    {isDownloading ? (
                      <Loader2 size={14} className="animate-spin text-brand" />
                    ) : downloadSuccess ? (
                      <Check size={14} className="text-emerald-400" />
                    ) : (
                      <Download size={14} />
                    )}
                    <span>{downloadSuccess ? 'Downloaded!' : 'Download'}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : isVideo ? (
            /* High performance video streaming with seek range support & transcode */
            <div className="relative max-h-[85vh] max-w-[85vw] flex items-center justify-center">
              {isTranscoding && (
                <div className="absolute inset-0 z-20 rounded-xl bg-black/85 backdrop-blur-md flex flex-col items-center justify-center gap-3 p-6 text-center border border-white/10">
                  <Loader2 size={36} className="text-emerald-400 animate-spin" />
                  <p className="text-sm font-semibold text-white">Transcoding with FFmpeg...</p>
                  <p className="text-xs text-zinc-400 max-w-xs">
                    Converting stream to H.264 with FastStart seeking. Playback starts
                    automatically.
                  </p>
                </div>
              )}
              <video
                ref={videoRef}
                controls
                autoPlay
                playsInline
                preload="metadata"
                src={
                  useTranscodeStream[file.id]
                    ? getMediaStreamUrl(file.id, undefined, true)
                    : getMediaStreamUrl(file.id)
                }
                onCanPlay={() => setIsTranscoding(false)}
                onPlaying={() => setIsTranscoding(false)}
                onError={() => handleVideoError(file.id)}
                onVolumeChange={handleVolumeChange}
                className="max-h-[82vh] max-w-[85vw] rounded-xl shadow-2xl bg-black border border-white/10 outline-none"
              >
                Your browser does not support HTML5 video streaming.
              </video>
            </div>
          ) : photoFailed ? (
            /* Fallback when photo has genuinely failed to load */
            <div className="flex flex-col items-center justify-center p-12 bg-zinc-900/80 border border-white/10 rounded-2xl text-center select-none max-w-md">
              <Camera size={48} className="text-zinc-600 mb-3" />
              <span className="text-sm font-medium text-white mb-1">{file.name}</span>
              <span className="text-xs text-zinc-500">Preview not available from Google Drive</span>
            </div>
          ) : (
            /* High resolution photo presentation with Instant Blur-Up + Crossfade */
            <div
              className={`relative flex items-center justify-center select-none ${
                isZoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'
              }`}
              onClick={() => {
                if (!hasSwipedRef.current) {
                  setIsZoomed((z) => !z);
                }
              }}
              style={{
                transform: `rotate(${rotation}deg) translateX(${touchDeltaX}px) scale(${isZoomed ? 2.0 : isFullscreen ? 1.25 : 1.0})`,
                transition: isSwiping ? 'none' : 'transform 250ms cubic-bezier(0.16, 1, 0.3, 1)',
                touchAction: isZoomed ? 'manipulation' : 'pan-y',
              }}
            >
              {/* Layer 1: Instant Blur-Up Placeholder from cached 400px thumbnail */}
              <img
                src={getMediaThumbUrl(file.id, 400, file.account_id, file.thumbnail_url)}
                alt=""
                aria-hidden="true"
                className={`transition-all duration-300 select-none object-contain ${
                  isExpanded
                    ? 'max-h-[96vh] max-w-[98vw] w-full h-full'
                    : 'max-h-[82vh] max-w-[85vw] rounded-lg'
                } filter blur-sm ${
                  highResLoaded ? 'opacity-0 absolute pointer-events-none' : 'opacity-100'
                }`}
              />

              {/* Layer 2: High-Resolution (1200px) Smooth Crossfade with Priority */}
              <img
                key={file.id}
                src={getMediaThumbUrl(file.id, 1200, file.account_id, file.thumbnail_url)}
                alt={file.name}
                fetchPriority="high"
                decoding="async"
                onLoad={() => setHighResLoaded(true)}
                onError={() => {
                  setPhotoFailed(true);
                  setHighResLoaded(true);
                }}
                className={`transition-all duration-300 ease-out select-none shadow-2xl object-contain ${
                  isExpanded
                    ? 'max-h-[96vh] max-w-[98vw] w-full h-full'
                    : 'max-h-[82vh] max-w-[85vw] rounded-lg'
                } ${highResLoaded ? 'opacity-100' : 'opacity-0 absolute'}`}
              />

              {/* Discreet spinner during initial sharp render */}
              {!highResLoaded && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
                </div>
              )}
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

        {/* Bottom Thumbnail Strip — Uses cached 400px thumbs with low priority to never block main photo */}
        <div
          className={`h-20 sm:h-16 px-6 py-2 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-center gap-2 overflow-x-auto z-10 transition-all duration-300 ${
            isExpanded
              ? 'opacity-0 pointer-events-none translate-y-8 max-h-0 overflow-hidden py-0'
              : 'opacity-100 max-h-20'
          }`}
          style={{
            paddingBottom: isExpanded ? '0px' : 'max(env(safe-area-inset-bottom, 0px), 12px)',
          }}
        >
          {files.slice(Math.max(0, currentIndex - 5), currentIndex + 6).map((f) => {
            const idx = files.indexOf(f);
            const active = idx === currentIndex;
            return (
              <button
                key={f.id}
                onClick={() => {
                  setCurrentIndex(idx);
                }}
                className={`h-12 w-12 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 relative ${
                  active
                    ? 'border-brand scale-110 shadow-md ring-2 ring-brand/40'
                    : 'border-white/20 opacity-50 hover:opacity-100 hover:border-white/50'
                }`}
              >
                <MediaThumbnail file={f} size={400} />
                {f.mime_type.startsWith('video/') && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
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
                  {formatFullDate(file.taken_at ?? file.modified_at)}
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

      {/* Add to Album Modal */}
      {showAlbumPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
          onClick={() => setShowAlbumPicker(false)}
        >
          <div
            className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <FolderPlus size={18} className="text-brand" />
                Add to Album
              </h3>
              <button
                onClick={() => setShowAlbumPicker(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>

            {loadingAlbums ? (
              <div className="py-8 flex items-center justify-center text-white/50 text-xs">
                Loading albums…
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
                {albums.length === 0 && !showCreateInline && (
                  <div className="text-center py-6 text-white/50 text-xs">
                    No albums yet. Create your first album below!
                  </div>
                )}

                {albums.map((alb) => {
                  const isAdded = addedAlbumId === alb.id;
                  return (
                    <button
                      key={alb.id}
                      onClick={() => handleAddToAlbum(alb.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                        isAdded
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-white/5 border-white/10 hover:bg-white/10 text-white'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{alb.title}</span>
                        <span className="text-[11px] text-white/50">
                          {alb.item_count ?? 0} items
                        </span>
                      </div>
                      {isAdded ? (
                        <Check size={18} className="text-emerald-400" />
                      ) : (
                        <Plus size={16} className="text-white/40" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Inline create new album */}
            {showCreateInline ? (
              <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                <input
                  type="text"
                  placeholder="Album title…"
                  value={newAlbumTitle}
                  onChange={(e) => setNewAlbumTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCreateAndAdd();
                  }}
                  autoFocus
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-brand"
                />
                <button
                  onClick={handleCreateAndAdd}
                  disabled={!newAlbumTitle.trim()}
                  className="px-4 py-2 bg-brand disabled:opacity-50 hover:bg-brand/90 text-white rounded-lg text-sm font-medium transition-all"
                >
                  Create
                </button>
                <button
                  onClick={() => setShowCreateInline(false)}
                  className="px-2 py-2 text-white/60 hover:text-white text-xs"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowCreateInline(true)}
                className="w-full py-2.5 px-4 rounded-xl border border-dashed border-white/20 hover:border-brand/60 text-white/70 hover:text-white text-xs font-medium flex items-center justify-center gap-2 hover:bg-brand/10 transition-all"
              >
                <Plus size={14} />
                Create New Album
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
