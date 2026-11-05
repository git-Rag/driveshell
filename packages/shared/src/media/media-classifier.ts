/**
 * media-classifier.ts — Pure, zero-dependency media classifier and code-exclusion helpers.
 *
 * Rules:
 *  - image/* counts as media (keeps HEIC, HEIF, RAW, WebP, etc.).
 *  - video/* counts ONLY if Drive provided videoMediaMetadata (duration_ms not null, or width and height not null).
 *  - Names ending .ts, .mts, .cts, .d.ts, .d.mts, .d.cts are NEVER media unless they have video metadata.
 *  - Real AVCHD .MTS/.M2TS videos with video metadata are treated as media.
 *  - Files under folders named in HIDDEN_FOLDER_NAMES (node_modules, .git, __pycache__, .venv) are marked hidden.
 */

export const HIDDEN_FOLDER_NAMES = [
  'node_modules',
  '.git',
  '__pycache__',
  '.venv',
] as const;

export type HiddenFolderName = (typeof HIDDEN_FOLDER_NAMES)[number];

export interface MediaClassifiableFile {
  name?: string | null | undefined;
  mime_type?: string | null | undefined;
  mimeType?: string | null | undefined;
  duration_ms?: number | null | undefined;
  durationMillis?: number | string | null | undefined;
  image_width?: number | null | undefined;
  image_height?: number | null | undefined;
  width?: number | null | undefined;
  height?: number | null | undefined;
  video_metadata?: {
    duration_ms?: number | null | undefined;
    width?: number | null | undefined;
    height?: number | null | undefined;
  } | null | undefined;
  videoMediaMetadata?: {
    durationMillis?: number | string | null | undefined;
    width?: number | null | undefined;
    height?: number | null | undefined;
  } | null | undefined;
}

const TS_EXTENSION_PATTERN = /\.(d\.(?:m|c)?ts|(?:m|c)?ts)$/i;

const NON_MEDIA_EXTENSION_PATTERN =
  /\.(pdf|docx?|xlsx?|pptx?|zip|rar|tar(\.gz)?|tgz|7z|json|txt|md|html?|css|js|cjs|mjs|exe|apk|dmg|iso)$/i;

const COMMON_IMAGE_EXTENSION_PATTERN =
  /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?|avif|raw|dng|cr2|nef|arw)$/i;

/** Check whether a file has video metadata (duration > 0 OR width and height both > 0). */
export function hasVideoMetadata(file: MediaClassifiableFile): boolean {
  // Check duration_ms / durationMillis
  if (file.duration_ms != null && file.duration_ms > 0) return true;
  if (file.durationMillis != null && Number(file.durationMillis) > 0) return true;
  if (
    file.video_metadata?.duration_ms != null &&
    file.video_metadata.duration_ms > 0
  ) {
    return true;
  }
  if (
    file.videoMediaMetadata?.durationMillis != null &&
    Number(file.videoMediaMetadata.durationMillis) > 0
  ) {
    return true;
  }

  // Check dimensions (both width and height must be present and > 0)
  const w =
    file.width ??
    file.image_width ??
    file.video_metadata?.width ??
    file.videoMediaMetadata?.width ??
    null;
  const h =
    file.height ??
    file.image_height ??
    file.video_metadata?.height ??
    file.videoMediaMetadata?.height ??
    null;

  if (w != null && h != null && w > 0 && h > 0) {
    return true;
  }

  return false;
}

/**
 * Pure, shared media classifier.
 *
 * Can be run in browser, node, tests, or migration scripts.
 */
export function isRealMedia(file: MediaClassifiableFile): boolean {
  const mime = (file.mime_type ?? file.mimeType ?? '').toLowerCase().trim();
  const name = (file.name ?? '').trim();

  // Exclude Google Docs/Sheets/Slides/Folders
  if (
    mime === 'application/vnd.google-apps.folder' ||
    mime.startsWith('application/vnd.google-apps.')
  ) {
    return false;
  }

  // Known document/code extensions are never media
  if (NON_MEDIA_EXTENSION_PATTERN.test(name)) {
    return false;
  }

  const isTsName = TS_EXTENSION_PATTERN.test(name);
  const hasMeta = hasVideoMetadata(file);

  // TypeScript declaration / source files (.ts, .mts, .cts, .d.ts, .d.mts, .d.cts)
  // Drive reports many .ts/.mts as video/mp2t. They are NEVER media unless Drive provided video metadata.
  if (isTsName) {
    if (!hasMeta) return false;
    // If it has video metadata and mime is video or extension is MTS/M2TS/TS
    return mime.startsWith('video/') || /\.(mts|m2ts|ts)$/i.test(name);
  }

  // All image/* MIME types are media (including HEIC, HEIF, RAW, etc.)
  if (mime.startsWith('image/')) {
    return true;
  }

  // Video MIME types are media ONLY if video metadata was provided
  if (mime.startsWith('video/')) {
    return hasMeta;
  }

  // Fallback extension matching if MIME is missing or generic application/octet-stream
  if (COMMON_IMAGE_EXTENSION_PATTERN.test(name)) {
    return true;
  }

  if (/\.(mp4|mov|avi|mkv|webm|3gp|m4v|mts|m2ts)$/i.test(name)) {
    return hasMeta;
  }

  return false;
}
