/**
 * In-memory session negative cache for thumbnails that returned 404 or failed to load.
 * Prevents retry loops and avoids re-requesting failed images on re-render or infinite scroll.
 */

const negativeCache = new Set<string>();

export function isThumbnailFailed(fileId: string): boolean {
  return negativeCache.has(fileId);
}

export function markThumbnailFailed(fileId: string): void {
  negativeCache.add(fileId);
}

export function clearThumbnailNegativeCache(): void {
  negativeCache.clear();
}
