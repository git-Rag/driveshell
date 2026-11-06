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

export const HIDDEN_FOLDER_NAMES = ['node_modules', '.git', '__pycache__', '.venv'] as const;

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
  video_metadata?:
    | {
        duration_ms?: number | null | undefined;
        width?: number | null | undefined;
        height?: number | null | undefined;
      }
    | null
    | undefined;
  videoMediaMetadata?:
    | {
        durationMillis?: number | string | null | undefined;
        width?: number | null | undefined;
        height?: number | null | undefined;
      }
    | null
    | undefined;
}

const STRICT_CODE_TS_PATTERN = /\.(d\.(?:m|c)?ts|c?ts)$/i;

const AVCHD_VIDEO_EXTENSION_PATTERN = /\.(mts|m2ts|m2t)$/i;

const COMMON_VIDEO_EXTENSION_PATTERN = /\.(mp4|mov|avi|mkv|webm|3gp|m4v)$/i;

const NON_MEDIA_EXTENSION_PATTERN =
  /\.(pdf|docx?|xlsx?|pptx?|zip|rar|tar(\.gz)?|tgz|7z|json|txt|md|html?|css|js|cjs|mjs|exe|apk|dmg|iso)$/i;

const COMMON_IMAGE_EXTENSION_PATTERN =
  /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?|avif|raw|dng|cr2|nef|arw)$/i;

/** Check whether a file has video metadata (duration > 0 OR width and height both > 0). */
export function hasVideoMetadata(file: MediaClassifiableFile): boolean {
  // Check duration_ms / durationMillis
  if (file.duration_ms != null && file.duration_ms > 0) return true;
  if (file.durationMillis != null && Number(file.durationMillis) > 0) return true;
  if (file.video_metadata?.duration_ms != null && file.video_metadata.duration_ms > 0) {
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
 * Rules:
 *  - image/* counts as media (keeps HEIC, HEIF, RAW, WebP, etc.).
 *  - video/* counts as media EXCEPT video/mp2t.
 *  - video/mp2t counts ONLY with video metadata AND non-TS name (real AVCHD .MTS/.M2TS).
 *  - Names ending .ts, .cts, .d.ts, .d.mts, .d.cts are NEVER media.
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

  // TypeScript declaration / source files (.ts, .cts, .d.ts, .d.mts, .d.cts)
  // are never media regardless of metadata or MIME type.
  if (STRICT_CODE_TS_PATTERN.test(name)) {
    return false;
  }

  // All image/* MIME types are media (including HEIC, HEIF, RAW, etc.)
  if (mime.startsWith('image/')) {
    return true;
  }

  // Video MIME types:
  if (mime.startsWith('video/')) {
    // video/mp2t counts as media ONLY with video metadata AND non-TS name
    if (mime === 'video/mp2t') {
      return hasVideoMetadata(file);
    }
    // All other video/* MIME types count as media (even without metadata)
    return true;
  }

  // Fallback extension matching if MIME is missing or generic application/octet-stream
  if (COMMON_IMAGE_EXTENSION_PATTERN.test(name)) {
    return true;
  }

  if (COMMON_VIDEO_EXTENSION_PATTERN.test(name)) {
    return true;
  }

  if (AVCHD_VIDEO_EXTENSION_PATTERN.test(name)) {
    return hasVideoMetadata(file);
  }

  return false;
}
