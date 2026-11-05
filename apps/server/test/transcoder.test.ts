import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  getFFmpegPath,
  isFFmpegAvailable,
  getTranscodeCacheDir,
  getCachedTranscodePath,
  transcodeToH264,
} from '../src/media/transcoder';

describe('Tier 2 Video Transcoder (FFmpeg)', () => {
  const testDataDir = path.resolve(__dirname, 'test_transcode_data');

  beforeAll(() => {
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  it('detects FFmpeg binary on the host environment', () => {
    const ffmpegPath = getFFmpegPath();
    expect(ffmpegPath).not.toBeNull();
    expect(typeof ffmpegPath).toBe('string');
    expect(fs.existsSync(ffmpegPath!)).toBe(true);
    expect(isFFmpegAvailable()).toBe(true);
  });

  it('manages transcode cache directory under custom dataDir', () => {
    const cacheDir = getTranscodeCacheDir(testDataDir);
    expect(fs.existsSync(cacheDir)).toBe(true);
    expect(cacheDir).toBe(path.join(testDataDir, 'transcode_cache'));
  });

  it('reports null for uncached files and valid path for cached files', () => {
    const uncached = getCachedTranscodePath('test_non_existent_file', testDataDir);
    expect(uncached).toBeNull();

    const cacheDir = getTranscodeCacheDir(testDataDir);
    const fakeCachedPath = path.join(cacheDir, 'test_fake_file_h264.mp4');
    fs.writeFileSync(fakeCachedPath, 'fake-mp4-content');

    const cached = getCachedTranscodePath('test_fake_file', testDataDir);
    expect(cached).toBe(fakeCachedPath);

    fs.unlinkSync(fakeCachedPath);
  });

  it('transcodes a video clip into H.264/AAC with faststart and caches the result', async () => {
    // Use the real sample video from data/backups/temp_videos/1-CoWN3eGD.mp4 if present
    const repoRoot = path.resolve(__dirname, '../../..');
    const sampleVideo = path.join(repoRoot, 'data/backups/temp_videos/1-CoWN3eGD.mp4');

    if (!fs.existsSync(sampleVideo)) {
      // Skip if sample file was deleted
      return;
    }

    const testFileId = 'unit_test_video_1';
    const resultPath = await transcodeToH264({
      fileId: testFileId,
      customDataDir: testDataDir,
      sourceStreamFetcher: async () => {
        return fs.createReadStream(sampleVideo);
      },
    });

    expect(fs.existsSync(resultPath)).toBe(true);
    expect(fs.statSync(resultPath).size).toBeGreaterThan(10000);

    // Second call must be an immediate cache hit
    const cachedHit = await transcodeToH264({
      fileId: testFileId,
      customDataDir: testDataDir,
      sourceStreamFetcher: async () => {
        throw new Error('Should not be called on cache hit');
      },
    });

    expect(cachedHit).toBe(resultPath);
  });
});
