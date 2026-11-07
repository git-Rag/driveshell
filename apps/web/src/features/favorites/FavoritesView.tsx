import { useState, useEffect, useCallback } from 'react';
import { Heart, Play, ZoomIn, ZoomOut } from 'lucide-react';
import type { FileRecord } from '../../lib/api';
import { listPhotos, updateFile } from '../../lib/api';
import { PhotoLightbox } from '../gallery/PhotoLightbox';
import { MediaThumbnail } from '../gallery/MediaThumbnail';
import { isRealMedia } from '@driveshell/shared';
import { registerBackButtonHandler } from '../../lib/back-button';

export function FavoritesView() {
  const [favorites, setFavorites] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState<number>(2); // 0..3
  const [activeLightboxIndex, setActiveLightboxIndex] = useState<number | null>(null);

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPhotos({ type: 'favorites', limit: 300 });
      setFavorites(res.files.filter(isRealMedia));
    } catch (err) {
      console.error('Failed to load favorites', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  // Handle hardware / system back button
  useEffect(() => {
    return registerBackButtonHandler(() => {
      if (activeLightboxIndex !== null) {
        setActiveLightboxIndex(null);
        return true;
      }
      return false; // let App.tsx navigate back to gallery
    });
  }, [activeLightboxIndex]);

  async function handleToggleFavorite(e: React.MouseEvent, file: FileRecord) {
    e.stopPropagation();
    try {
      await updateFile(file.id, { starred: 0 });
      setFavorites((prev) => prev.filter((f) => f.id !== file.id));
    } catch (err) {
      console.error('Failed to unstar', err);
    }
  }

  function handleFileUpdated(updated: FileRecord) {
    if (updated.starred === 0) {
      setFavorites((prev) => prev.filter((f) => f.id !== updated.id));
    } else {
      setFavorites((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    }
  }

  const gridColsClass =
    zoomLevel === 0
      ? 'grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5'
      : zoomLevel === 1
        ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2'
        : zoomLevel === 2
          ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5'
          : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3';

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--ds-bg)] text-white overflow-hidden select-none">
      {/* Top Bar */}
      <div
        className="px-4 sm:px-8 py-5 border-b border-[var(--ds-border-subtle)] bg-[var(--ds-bg-raised)]/80 backdrop-blur-md flex items-center justify-between pt-12 sm:pt-5"
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px), 48px)',
          paddingLeft: 'max(env(safe-area-inset-left, 0px), 16px)',
          paddingRight: 'max(env(safe-area-inset-right, 0px), 16px)',
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
            <Heart size={20} fill="currentColor" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">Favorites</h1>
              <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/70 text-xs font-mono">
                {favorites.length}
              </span>
            </div>
            <span className="text-xs text-white/50">
              Photos and videos you've starred across your Google Drive.
            </span>
          </div>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-full border border-white/10">
          <button
            onClick={() => setZoomLevel((z) => Math.max(0, z - 1))}
            disabled={zoomLevel <= 0}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white disabled:opacity-30 transition-all hover:bg-white/10"
            title="Smaller photos"
          >
            <ZoomOut size={15} />
          </button>
          <button
            onClick={() => setZoomLevel((z) => Math.min(3, z + 1))}
            disabled={zoomLevel >= 3}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white disabled:opacity-30 transition-all hover:bg-white/10"
            title="Larger photos"
          >
            <ZoomIn size={15} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-white/40 text-sm">
            Loading favorites…
          </div>
        ) : favorites.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-96 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-rose-500/40">
              <Heart size={32} />
            </div>
            <div className="flex flex-col gap-1 max-w-sm">
              <h3 className="text-base font-semibold text-white">No favorites yet</h3>
              <p className="text-xs text-white/50 leading-relaxed">
                Click the heart icon on any photo or video in the gallery to add it to your
                favorites.
              </p>
            </div>
          </div>
        ) : (
          <div className={`grid ${gridColsClass}`}>
            {favorites.map((file, idx) => {
              const isVideo = file.mime_type.startsWith('video/');
              return (
                <div
                  key={file.id}
                  onClick={() => setActiveLightboxIndex(idx)}
                  className="group relative aspect-square rounded-xl overflow-hidden bg-zinc-900 border border-white/5 hover:border-brand/40 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-xl hover:scale-[1.02]"
                >
                  <MediaThumbnail file={file} size={400} />

                  {isVideo && (
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md flex items-center gap-1 text-[10px] text-white font-medium">
                      <Play size={10} className="fill-white" />
                      Video
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-2.5">
                    <span className="text-[11px] font-medium text-white truncate max-w-[75%]">
                      {file.name}
                    </span>
                    <button
                      onClick={(e) => handleToggleFavorite(e, file)}
                      className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white transition-all shadow-md"
                      title="Remove from favorites"
                    >
                      <Heart size={14} fill="currentColor" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {activeLightboxIndex !== null && (
        <PhotoLightbox
          files={favorites}
          initialIndex={activeLightboxIndex}
          onClose={() => setActiveLightboxIndex(null)}
          onFileUpdated={handleFileUpdated}
        />
      )}
    </div>
  );
}
