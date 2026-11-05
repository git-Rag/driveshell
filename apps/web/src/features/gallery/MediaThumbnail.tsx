import { useState } from 'react';
import { Film, Image as ImageIcon } from 'lucide-react';
import type { FileRecord } from '../../lib/api';
import { getMediaThumbUrl } from '../../lib/api';
import { isThumbnailFailed, markThumbnailFailed } from '../../lib/thumbnail-cache';

interface MediaThumbnailProps {
  file: FileRecord;
  size: number;
  className?: string;
  alt?: string;
  loading?: 'lazy' | 'eager';
}

export function MediaThumbnail({
  file,
  size,
  className = '',
  alt,
  loading = 'lazy',
}: MediaThumbnailProps) {
  const isVideo = file.mime_type.startsWith('video/');
  // Rule: A tile with no thumbnail must make NO image request.
  // Rule: Videos use the thumbnail only when Drive provided one.
  const hasDriveThumb = Boolean(file.thumbnail_url);
  const [loadFailed, setLoadFailed] = useState(() => isThumbnailFailed(file.id));

  // If Drive did not provide a thumbnail OR a previous request 404'd in this session,
  // render a clean placeholder icon and make NO image HTTP request.
  if (!hasDriveThumb || loadFailed) {
    return (
      <div
        className={`w-full h-full flex flex-col items-center justify-center bg-zinc-900 text-zinc-600 select-none ${className}`}
        title={file.name}
      >
        {isVideo ? (
          <Film size={Math.min(32, Math.max(16, Math.floor(size / 15)))} className="opacity-60 text-zinc-400" />
        ) : (
          <ImageIcon size={Math.min(32, Math.max(16, Math.floor(size / 15)))} className="opacity-40" />
        )}
        <span className="text-[10px] font-mono text-zinc-500 mt-1 max-w-[85%] truncate text-center px-1">
          {file.name}
        </span>
      </div>
    );
  }

  return (
    <img
      src={getMediaThumbUrl(file.id, size)}
      alt={alt ?? file.name}
      loading={loading}
      className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${className}`}
      onError={() => {
        // Negative-cache 404 / network errors for this session
        markThumbnailFailed(file.id);
        setLoadFailed(true);
      }}
    />
  );
}
