import { useState } from 'react';
import { Film, Image as ImageIcon } from 'lucide-react';
import type { FileRecord } from '../../lib/api';
import { getMediaThumbUrl } from '../../lib/api';

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
  const [loadFailed, setLoadFailed] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  if (loadFailed) {
    return (
      <div
        className={`w-full h-full flex flex-col items-center justify-center bg-zinc-900 text-zinc-600 select-none ${className}`}
        title={file.name}
      >
        {isVideo ? (
          <Film
            size={Math.min(32, Math.max(16, Math.floor(size / 15)))}
            className="opacity-60 text-zinc-400"
          />
        ) : (
          <ImageIcon
            size={Math.min(32, Math.max(16, Math.floor(size / 15)))}
            className="opacity-40"
          />
        )}
        <span className="text-[10px] font-mono text-zinc-500 mt-1 max-w-[85%] truncate text-center px-1">
          {file.name}
        </span>
      </div>
    );
  }

  const thumbUrl = getMediaThumbUrl(file.id, size);
  const src =
    retryCount > 0
      ? `${thumbUrl}${thumbUrl.includes('?') ? '&' : '?'}retry=${retryCount}`
      : thumbUrl;

  return (
    <div className={`relative w-full h-full overflow-hidden bg-zinc-900 ${className}`}>
      {/* Sleek placeholder while image decodes/loads */}
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 text-zinc-700 select-none">
          {isVideo ? (
            <Film size={20} className="opacity-25 text-zinc-500" />
          ) : (
            <ImageIcon size={20} className="opacity-15" />
          )}
        </div>
      )}

      <img
        src={src}
        alt={alt ?? file.name}
        loading={loading}
        onLoad={() => setIsLoaded(true)}
        onError={() => {
          if (retryCount < 1) {
            // One-time retry after 400ms to allow Drive background metadata/caching to settle
            setTimeout(() => setRetryCount((c) => c + 1), 400);
          } else {
            setLoadFailed(true);
          }
        }}
        className={`w-full h-full object-cover transition-opacity duration-200 group-hover:scale-105 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
}
