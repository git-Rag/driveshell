import React, { memo } from 'react';
import { Heart, Play } from 'lucide-react';
import type { FileRecord } from '../../lib/api';
import { MediaThumbnail } from './MediaThumbnail';

export interface GalleryTileProps {
  file: FileRecord;
  globalIndex: number;
  zoom: 1 | 2 | 3 | 4;
  aspectClass: string;
  size: number;
  onClick: (index: number) => void;
}

export const GalleryTile = memo(
  function GalleryTile({ file, globalIndex, zoom, aspectClass, size, onClick }: GalleryTileProps) {
    const isVideo = file.mime_type.startsWith('video/');

    return (
      <div
        data-testid="gallery-tile"
        onClick={() => onClick(globalIndex)}
        className={`group relative rounded-lg overflow-hidden bg-zinc-900 border border-white/5 cursor-pointer transition-transform duration-150 hover:border-brand/70 hover:scale-[1.015] hover:z-10 hover:shadow-xl ${aspectClass}`}
      >
        {/* Thumbnail Image / Placeholder — Always mounted so loaded bitmaps persist during scroll */}
        <MediaThumbnail file={file} size={size} />

        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex flex-col justify-between p-2 pointer-events-none">
          {/* Top Badges */}
          <div className="flex items-center justify-between">
            {file.starred === 1 ? (
              <span className="p-1 rounded-full bg-rose-500/90 text-white shadow-sm">
                <Heart size={11} fill="currentColor" />
              </span>
            ) : (
              <div />
            )}
            {isVideo && (
              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-black/80 text-white font-mono shadow-sm">
                <Play size={8} fill="currentColor" /> Video
              </span>
            )}
          </div>

          {/* Bottom Title on larger zoom */}
          {zoom >= 3 && (
            <div>
              <p className="text-xs font-medium text-white truncate drop-shadow">{file.name}</p>
              <p className="text-[10px] text-zinc-300 font-mono">
                {new Date(file.taken_at ?? file.modified_at).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.file.id === next.file.id &&
    prev.file.starred === next.file.starred &&
    prev.zoom === next.zoom &&
    prev.globalIndex === next.globalIndex,
);
