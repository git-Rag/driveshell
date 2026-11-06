/**
 * transcoder.ts — On-demand Tier 2 Video Transcoder & Local Cache Manager
 *
 * Transcodes unsupported codecs (e.g. HEVC/H.265, AVCHD .MTS, Apple ProRes)
 * into universal H.264/AAC MP4 with faststart (moov at start) for seamless playback.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { getDataDir } from '../db/connection';

let cachedFFmpegPath: string | null = null;
let cachedFFprobePath: string | null | undefined = undefined;
const activeJobs = new Map<string, Promise<string>>();

/**
 * Locate the FFmpeg executable on the system or package bundle.
 */
export function getFFmpegPath(): string | null {
  if (cachedFFmpegPath && fs.existsSync(cachedFFmpegPath)) {
    return cachedFFmpegPath;
  }

  // 1. Explicit environment variable
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    cachedFFmpegPath = process.env.FFMPEG_PATH;
    return cachedFFmpegPath;
  }

  // 2. Bundled binary candidates relative to Node or application
  const appCandidates = [
    path.join(path.dirname(process.execPath), 'ffmpeg.exe'),
    path.join(path.dirname(process.execPath), '..', 'bin', 'ffmpeg.exe'),
    path.join(path.dirname(process.execPath), 'resources', 'bin', 'ffmpeg.exe'),
    path.join(process.cwd(), 'bin', 'ffmpeg.exe'),
    path.join(process.cwd(), 'resources', 'bin', 'ffmpeg.exe'),
  ];
  for (const c of appCandidates) {
    if (fs.existsSync(c)) {
      cachedFFmpegPath = c;
      return cachedFFmpegPath;
    }
  }

  // 3. PATH resolution
  try {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'where ffmpeg' : 'which ffmpeg';
    const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    const firstLine = output.split(/\r?\n/)[0]?.trim();
    if (firstLine && fs.existsSync(firstLine)) {
      cachedFFmpegPath = firstLine;
      return cachedFFmpegPath;
    }
  } catch {
    // Not found in PATH
  }

  // 4. Known WinGet path on Windows
  if (process.platform === 'win32') {
    const wingetBase = path.join(
      process.env.LOCALAPPDATA ?? 'C:\\Users\\HP\\AppData\\Local',
      'Microsoft\\WinGet\\Packages',
    );
    if (fs.existsSync(wingetBase)) {
      try {
        const entries = fs.readdirSync(wingetBase);
        for (const entry of entries) {
          if (entry.toLowerCase().includes('ffmpeg')) {
            const candidate = path.join(
              wingetBase,
              entry,
              'ffmpeg-9.0.2-full_build',
              'bin',
              'ffmpeg.exe',
            );
            if (fs.existsSync(candidate)) {
              cachedFFmpegPath = candidate;
              return cachedFFmpegPath;
            }
          }
        }
      } catch {
        // Ignore directory read error
      }
    }
  }

  return null;
}

/**
 * Locate the FFprobe executable on the system.
 */
export function getFFprobePath(): string | null {
  if (cachedFFprobePath !== undefined) return cachedFFprobePath;
  const ffmpeg = getFFmpegPath();
  if (ffmpeg) {
    const probeCandidate = ffmpeg.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');
    if (fs.existsSync(probeCandidate)) {
      cachedFFprobePath = probeCandidate;
      return cachedFFprobePath;
    }
  }
  try {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'where ffprobe' : 'which ffprobe';
    const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    const firstLine = output.split(/\r?\n/)[0]?.trim();
    if (firstLine && fs.existsSync(firstLine)) {
      cachedFFprobePath = firstLine;
      return cachedFFprobePath;
    }
  } catch {
    // ffprobe not available
  }
  cachedFFprobePath = null;
  return null;
}

export function isFFmpegAvailable(): boolean {
  return getFFmpegPath() !== null;
}

/**
 * Get the transcode cache directory under dataDir.
 */
export function getTranscodeCacheDir(customDataDir?: string): string {
  const dir = path.join(customDataDir ?? getDataDir(), 'transcode_cache');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Get path to the transcoded H.264 file if it exists in the cache.
 */
export function getCachedTranscodePath(fileId: string, customDataDir?: string): string | null {
  const cacheDir = getTranscodeCacheDir(customDataDir);
  const targetPath = path.join(cacheDir, `${fileId}_h264.mp4`);
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
    return targetPath;
  }
  return null;
}

export interface TranscodeOptions {
  fileId: string;
  sourceStreamFetcher: () => Promise<Readable>;
  customDataDir?: string;
  signal?: AbortSignal;
}

/**
 * Transcode an upstream video stream into universal H.264/AAC MP4.
 * Coalesces concurrent requests for the same fileId into a single execution.
 */
export async function transcodeToH264(options: TranscodeOptions): Promise<string> {
  const { fileId, sourceStreamFetcher, customDataDir, signal } = options;

  // 1. Check existing cache
  const cached = getCachedTranscodePath(fileId, customDataDir);
  if (cached) return cached;

  // 2. Coalesce concurrent requests
  if (activeJobs.has(fileId)) {
    return activeJobs.get(fileId)!;
  }

  const job = (async () => {
    const ffmpeg = getFFmpegPath();
    if (!ffmpeg) {
      throw new Error('FFmpeg executable not found on the system');
    }

    const cacheDir = getTranscodeCacheDir(customDataDir);
    const rawTempPath = path.join(cacheDir, `raw_${fileId}_${Date.now()}.tmp`);
    const transcodeTempPath = path.join(cacheDir, `tmp_${fileId}_${Date.now()}.mp4`);
    const finalTargetPath = path.join(cacheDir, `${fileId}_h264.mp4`);

    try {
      // Step A: Download source stream to temporary raw file
      // Required because MP4s with `moov` at the end (e.g. Snapchat) cannot be parsed from a non-seekable pipe
      const sourceStream = await sourceStreamFetcher();
      const rawWriteStream = fs.createWriteStream(rawTempPath);
      await pipeline(sourceStream, rawWriteStream);

      if (signal?.aborted) {
        throw new Error('Transcode aborted by client');
      }

      // Step B: Probe source video codec to choose between fast remuxing vs full re-encoding
      let isH264 = false;
      const ffprobe = getFFprobePath();
      if (ffprobe) {
        try {
          const probeOut = execSync(
            `"${ffprobe}" -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${rawTempPath}"`,
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 5000 },
          )
            .trim()
            .toLowerCase();
          if (probeOut === 'h264' || probeOut === 'avc1') {
            isH264 = true;
          }
        } catch {
          // Fall back to full re-encode if probe fails
        }
      }

      // Helper to run FFmpeg process with abort signal handling
      const runFFmpeg = (args: string[]) =>
        new Promise<void>((resolve, reject) => {
          const proc = spawn(ffmpeg, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
          });

          const onAbort = () => {
            proc.kill('SIGKILL');
            reject(new Error('Transcode aborted by client'));
          };

          if (signal) {
            signal.addEventListener('abort', onAbort, { once: true });
          }

          proc.on('error', (err) => {
            if (signal) signal.removeEventListener('abort', onAbort);
            reject(err);
          });

          proc.on('close', (code) => {
            if (signal) signal.removeEventListener('abort', onAbort);
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`FFmpeg exited with non-zero code ${code}`));
            }
          });
        });

      // If already H.264, perform instant container remuxing with +faststart (takes <150ms and 0 CPU re-encoding)
      // Otherwise re-encode with libx264 ultrafast preset
      if (isH264) {
        try {
          await runFFmpeg([
            '-y',
            '-i',
            rawTempPath,
            '-c',
            'copy',
            '-movflags',
            '+faststart',
            transcodeTempPath,
          ]);
        } catch {
          // If remuxing fails (e.g. incompatible audio track), fall back to re-encoding
          if (fs.existsSync(transcodeTempPath)) {
            try {
              fs.unlinkSync(transcodeTempPath);
            } catch {
              // ignore
            }
          }
          await runFFmpeg([
            '-y',
            '-i',
            rawTempPath,
            '-c:v',
            'libx264',
            '-preset',
            'ultrafast',
            '-crf',
            '23',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-b:a',
            '128k',
            '-movflags',
            '+faststart',
            transcodeTempPath,
          ]);
        }
      } else {
        await runFFmpeg([
          '-y',
          '-i',
          rawTempPath,
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-crf',
          '23',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-movflags',
          '+faststart',
          transcodeTempPath,
        ]);
      }

      // Step C: Atomically move transcode temp file to final target
      if (fs.existsSync(transcodeTempPath)) {
        fs.renameSync(transcodeTempPath, finalTargetPath);
      }

      return finalTargetPath;
    } finally {
      // Clean up temp files
      if (fs.existsSync(rawTempPath)) {
        try {
          fs.unlinkSync(rawTempPath);
        } catch {
          // Ignore
        }
      }
      if (fs.existsSync(transcodeTempPath)) {
        try {
          fs.unlinkSync(transcodeTempPath);
        } catch {
          // Ignore
        }
      }
      activeJobs.delete(fileId);
    }
  })();

  activeJobs.set(fileId, job);
  return job;
}
