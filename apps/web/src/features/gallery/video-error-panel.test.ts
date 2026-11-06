/**
 * video-error-panel.test.ts — Unit tests for video playback failure handling and codec detection
 */

import { describe, it, expect } from 'vitest';
import {
  detectProbableCodec,
  isVideoPlaybackFailed,
  markVideoPlaybackFailed,
} from './PhotoLightbox';

describe('Video Error Handling & Codec Detection (Part A)', () => {
  it('detects HEVC / H.265 for Snapchat mp4 files', () => {
    expect(detectProbableCodec('Snapchat-759670278.mp4', 'video/mp4')).toBe('HEVC / H.265');
  });

  it('detects MPEG-2 Transport Stream for AVCHD mts files', () => {
    expect(detectProbableCodec('clip.MTS', 'video/mp2t')).toBe('MPEG-2 Transport Stream (AVCHD)');
  });

  it('detects Apple ProRes / HEVC for QuickTime mov files', () => {
    expect(detectProbableCodec('recording.mov', 'video/quicktime')).toBe('Apple ProRes / HEVC');
  });

  it('maintains negative session cache for failed video IDs', () => {
    const fileId = 'test-failed-video-123';
    expect(isVideoPlaybackFailed(fileId)).toBe(false);
    markVideoPlaybackFailed(fileId);
    expect(isVideoPlaybackFailed(fileId)).toBe(true);
  });
});
