/**
 * scripts/diagnose-video-stream.ts — Automated Video Playback & Stream Diagnostic Suite
 *
 * Implements Part A1 diagnosis:
 * 1. Test /api/media/:id/stream with Range headers (0-1023, middle, last 1KB, past-EOF, no Range)
 * 2. Verify 206/416 response codes and byte hash parity against full Drive download
 * 3. Inspect codec, container, resolution, rotation, bitrate, and moov atom position via ffprobe and atom scanner
 * 4. Run automated browser playback in Microsoft Edge (channel msedge) and Firefox
 * 5. Output full diagnosis report and verdict table for docs/audits/01b-video-and-scroll.md
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { registerSessionMiddleware, setSessionCookie } from '../apps/server/src/auth/session';
import { registerSecurityHeaders } from '../apps/server/src/auth/security-headers';
import { registerMediaRoutes } from '../apps/server/src/routes/media';
import { chromium, firefox } from '../apps/web/node_modules/@playwright/test';

const repoRoot = path.resolve(__dirname, '..');
const dbCopyPath = path.join(repoRoot, 'data/backups/diagnose_video_copy.db');
const tempDir = path.join(repoRoot, 'data/backups/temp_videos');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

const ffprobePath =
  'C:\\Users\\HP\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin\\ffprobe.exe';

interface VideoSample {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  classType: 'Snapchat (Failing)' | 'Standard (Working)';
}

const TEST_VIDEOS: VideoSample[] = [
  // 3 Failing-type (Snapchat MP4s)
  {
    id: '1-CoWN3eGDz_gBGo_-0zcjpQdWHIyekGY',
    name: 'Snapchat-759670278.mp4',
    mime_type: 'video/mp4',
    size_bytes: 1646729,
    classType: 'Snapchat (Failing)',
  },
  {
    id: '1-WawLxgrUNRoKToXQWhCkjbpl6zoJc7o',
    name: 'Snapchat-193712038.mp4',
    mime_type: 'video/mp4',
    size_bytes: 2114813,
    classType: 'Snapchat (Failing)',
  },
  {
    id: '1-g1l_6cGaftOBynjO5BJFGQvHVaHi18r',
    name: 'Snapchat-1477866440.mp4',
    mime_type: 'video/mp4',
    size_bytes: 2989703,
    classType: 'Snapchat (Failing)',
  },
  // 3 Working-type
  {
    id: '1Bm7A9pa1bRbEfIc9LRc9-hHbFhgwtdtY',
    name: 'WhatsApp Video 2026-09-14 at 10.07.47 PM.mp4',
    mime_type: 'video/mp4',
    size_bytes: 1042068,
    classType: 'Standard (Working)',
  },
  {
    id: '1ZQrH5kEGzqpNW12xFvRxsr5pSdZBU-9p',
    name: 'VID-20261011-WA0008.mp4',
    mime_type: 'video/mp4',
    size_bytes: 1051560,
    classType: 'Standard (Working)',
  },
  {
    id: '1r2bAT9ytQtqKHDHIay5pTFDkPOn06S1m',
    name: 'WA_1788903806708.mp4',
    mime_type: 'video/mp4',
    size_bytes: 1206923,
    classType: 'Standard (Working)',
  },
];

interface MoovAtomInfo {
  position: 'start' | 'end' | 'unknown';
  moovOffset: number;
  mdatOffset: number;
}

function scanMp4Atoms(filePath: string): MoovAtomInfo {
  const fd = fs.openSync(filePath, 'r');
  const stat = fs.fstatSync(fd);
  let offset = 0;
  let moovOffset = -1;
  let mdatOffset = -1;

  const header = Buffer.alloc(8);
  while (offset + 8 <= stat.size) {
    fs.readSync(fd, header, 0, 8, offset);
    const size = header.readUInt32BE(0);
    const type = header.subarray(4, 8).toString('ascii');

    if (type === 'moov' && moovOffset === -1) moovOffset = offset;
    if (type === 'mdat' && mdatOffset === -1) mdatOffset = offset;

    if (size === 0) break; // extends to EOF
    if (size === 1) {
      // 64-bit extended size
      const extSizeBuf = Buffer.alloc(8);
      fs.readSync(fd, extSizeBuf, 0, 8, offset + 8);
      const extSize = Number(extSizeBuf.readBigUInt64BE(0));
      offset += extSize;
    } else {
      offset += size;
    }
  }
  fs.closeSync(fd);

  let position: 'start' | 'end' | 'unknown' = 'unknown';
  if (moovOffset !== -1 && mdatOffset !== -1) {
    position = moovOffset < mdatOffset ? 'start' : 'end';
  } else if (moovOffset !== -1) {
    position = moovOffset < stat.size / 2 ? 'start' : 'end';
  }

  return { position, moovOffset, mdatOffset };
}

async function startTestServer() {
  const serverPort = 3199;
  const app = Fastify({ logger: false });

  await registerSecurityHeaders(app);
  const db = new Database(dbCopyPath);
  await registerSessionMiddleware(app, serverPort);

  app.get('/health', async (_req, reply) => {
    setSessionCookie(reply, serverPort);
    return { status: 'ok' };
  });

  // Test player HTML page for Playwright matching real PhotoLightbox.tsx
  app.get('/player', async (req, reply) => {
    const q = req.query as { fileId?: string; mime?: string; codec?: string };
    const fileId = q.fileId ?? '';
    const mime = q.mime ?? 'video/mp4';
    const codec = q.codec ?? '';

    const html = `<!DOCTYPE html>
<html>
<head><title>Video Test Player</title></head>
<body>
  <h2>Playing: ${fileId}</h2>
  <video id="testVideo" controls muted playsinline width="400" preload="metadata" src="/api/media/${fileId}/stream"></video>
  <div id="results"></div>
  <script>
    const v = document.getElementById('testVideo');
    const out = {
      canPlayMime: v.canPlayType('${mime}'),
      canPlayCodec: v.canPlayType('${mime}; codecs="${codec}"'),
      canPlayAvc: v.canPlayType('video/mp4; codecs="avc1.42E01E"'),
      canPlayHevc1: v.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"'),
      canPlayHevc2: v.canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"'),
      events: [],
      error: null,
      startedPlayback: false,
    };
    window.__videoTest = out;

    ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'play', 'playing', 'timeupdate', 'waiting', 'error'].forEach(evt => {
      v.addEventListener(evt, (e) => {
        out.events.push(evt);
        if (evt === 'playing' || evt === 'timeupdate') {
          out.startedPlayback = true;
        }
        if (evt === 'error') {
          const err = v.error;
          out.error = err ? { code: err.code, message: err.message } : { code: -1, message: 'unknown error' };
        }
      });
    });

    // Attempt playback
    v.play().catch(e => {
      out.playCatch = e.message;
    });
  </script>
</body>
</html>`;
    reply.type('text/html').send(html);
  });

  await registerMediaRoutes(app, db, serverPort);

  await app.listen({ port: serverPort, host: '127.0.0.1' });
  console.log(`Diagnostic test server running at http://127.0.0.1:${serverPort}`);

  return {
    port: serverPort,
    close: async () => {
      await app.close();
      db.close();
    },
  };
}

async function runDiagnosis() {
  console.log('========================================================================');
  console.log('DriveShell Video Diagnosis Suite — Part A1 (ffprobe, Stream & Browsers)');
  console.log('========================================================================\n');

  const server = await startTestServer();
  const baseUrl = `http://127.0.0.1:${server.port}`;

  // 1. Obtain session cookie from /health
  const healthRes = await fetch(`${baseUrl}/health`);
  const setCookie = healthRes.headers.get('set-cookie') || '';
  const cookieHeader = setCookie.split(';')[0] || '';
  console.log('Obtained session cookie:', cookieHeader ? 'YES' : 'NO');

  const headers = { Cookie: cookieHeader };

  // Prepare browser instances
  console.log('Launching Microsoft Edge (channel: msedge)...');
  const edgeBrowser = await chromium.launch({ channel: 'msedge', headless: true });
  console.log('Launching Firefox...');
  const firefoxBrowser = await firefox.launch({ headless: true });

  const diagnosisResults: any[] = [];

  for (const video of TEST_VIDEOS) {
    console.log(`\n------------------------------------------------------------------------`);
    console.log(`Testing File: [${video.id.slice(0, 10)}...] ${video.name}`);
    console.log(
      `Class: ${video.classType} | Size: ${video.size_bytes} bytes | Stored MIME: ${video.mime_type}`,
    );
    console.log(`------------------------------------------------------------------------`);

    // A. Full Stream Download & Stream Endpoint Verification
    console.log('1. Testing Stream Endpoint /api/media/:id/stream:');
    const localVideoFile = path.join(tempDir, `${video.id.slice(0, 10)}.mp4`);

    // Request 1: No Range (full download)
    let fullBuffer: Buffer;
    let fullStatus = 200;
    let fullContentType = video.mime_type;
    let fullContentLength = video.size_bytes;
    let fullContentRange: string | null = null;
    let fullAcceptRanges: string | null = 'bytes';

    if (fs.existsSync(localVideoFile)) {
      fullBuffer = fs.readFileSync(localVideoFile);
      console.log(`   - Full download cached (${fullBuffer.length} bytes)`);
    } else {
      const fullRes = await fetch(`${baseUrl}/api/media/${video.id}/stream`, { headers });
      fullStatus = fullRes.status;
      fullContentType = fullRes.headers.get('content-type') || '';
      fullContentLength = Number(fullRes.headers.get('content-length') ?? 0);
      fullContentRange = fullRes.headers.get('content-range');
      fullAcceptRanges = fullRes.headers.get('accept-ranges');
      fullBuffer = Buffer.from(await fullRes.arrayBuffer());
      fs.writeFileSync(localVideoFile, fullBuffer);
    }
    const fullSha256 = crypto.createHash('sha256').update(fullBuffer).digest('hex');
    console.log(
      `   - No Range: status=${fullStatus}, content-type=${fullContentType}, length=${fullContentLength}/${fullBuffer.length}, range=${fullContentRange}, accept-ranges=${fullAcceptRanges}`,
    );
    console.log(`   - SHA-256: ${fullSha256.slice(0, 16)}...`);

    // Request 2: Range bytes=0-1023 (First 1KB)
    const r1Res = await fetch(`${baseUrl}/api/media/${video.id}/stream`, {
      headers: { ...headers, Range: 'bytes=0-1023' },
    });
    const r1Status = r1Res.status;
    const r1Length = Number(r1Res.headers.get('content-length') ?? 0);
    const r1Range = r1Res.headers.get('content-range');
    const r1Buffer = Buffer.from(await r1Res.arrayBuffer());
    const r1MatchesFull = r1Buffer.equals(fullBuffer.subarray(0, 1024));
    console.log(
      `   - Range 0-1023: status=${r1Status}, length=${r1Length}, range=${r1Range}, byteMatch=${r1MatchesFull}`,
    );

    // Request 3: Middle Range (bytes=50000-51023)
    const midStart = Math.min(50000, Math.floor(fullBuffer.length / 2));
    const midEnd = midStart + 1023;
    const r2Res = await fetch(`${baseUrl}/api/media/${video.id}/stream`, {
      headers: { ...headers, Range: `bytes=${midStart}-${midEnd}` },
    });
    const r2Status = r2Res.status;
    const r2Length = Number(r2Res.headers.get('content-length') ?? 0);
    const r2Range = r2Res.headers.get('content-range');
    const r2Buffer = Buffer.from(await r2Res.arrayBuffer());
    const r2MatchesFull = r2Buffer.equals(fullBuffer.subarray(midStart, midEnd + 1));
    console.log(
      `   - Middle (${midStart}-${midEnd}): status=${r2Status}, length=${r2Length}, range=${r2Range}, byteMatch=${r2MatchesFull}`,
    );

    // Request 4: Last 1KB
    const lastStart = Math.max(0, fullBuffer.length - 1024);
    const lastEnd = fullBuffer.length - 1;
    const r3Res = await fetch(`${baseUrl}/api/media/${video.id}/stream`, {
      headers: { ...headers, Range: `bytes=${lastStart}-${lastEnd}` },
    });
    const r3Status = r3Res.status;
    const r3Length = Number(r3Res.headers.get('content-length') ?? 0);
    const r3Range = r3Res.headers.get('content-range');
    const r3Buffer = Buffer.from(await r3Res.arrayBuffer());
    const r3MatchesFull = r3Buffer.equals(fullBuffer.subarray(lastStart, fullBuffer.length));
    console.log(
      `   - Last 1KB (${lastStart}-${lastEnd}): status=${r3Status}, length=${r3Length}, range=${r3Range}, byteMatch=${r3MatchesFull}`,
    );

    // Request 5: Past-EOF Range (bytes=size+1000 - size+2000)
    const pastStart = fullBuffer.length + 1000;
    const pastEnd = fullBuffer.length + 2000;
    const pastRes = await fetch(`${baseUrl}/api/media/${video.id}/stream`, {
      headers: { ...headers, Range: `bytes=${pastStart}-${pastEnd}` },
    });
    const pastStatus = pastRes.status;
    const pastRange = pastRes.headers.get('content-range');
    console.log(
      `   - Past-EOF (${pastStart}-${pastEnd}): status=${pastStatus} (expected 416, got ${pastStatus}), range=${pastRange}`,
    );

    // B. MP4 Atom Position Analysis
    const atomInfo = scanMp4Atoms(localVideoFile);
    console.log(`2. MP4 Atom Structure:`);
    console.log(
      `   - moov position: ${atomInfo.position.toUpperCase()} (moov offset=${atomInfo.moovOffset}, mdat offset=${atomInfo.mdatOffset})`,
    );

    // C. ffprobe Analysis
    console.log(`3. ffprobe Analysis:`);
    let probeData: any = {};
    try {
      const probeJson = execFileSync(
        ffprobePath,
        ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', localVideoFile],
        { encoding: 'utf-8' },
      );
      probeData = JSON.parse(probeJson);
    } catch (e: any) {
      console.error('   ffprobe execution failed:', e.message);
    }

    const videoStream = probeData.streams?.find((s: any) => s.codec_type === 'video') || {};
    const audioStream = probeData.streams?.find((s: any) => s.codec_type === 'audio') || {};
    const format = probeData.format || {};

    const codecName = videoStream.codec_name || 'unknown';
    const codecTag = videoStream.codec_tag_string || 'unknown';
    const container = format.format_name || 'unknown';
    const resolution = `${videoStream.width || 0}x${videoStream.height || 0}`;
    const bitrate = format.bit_rate
      ? `${Math.round(Number(format.bit_rate) / 1000)} kbps`
      : 'unknown';

    // Rotation from side data or tags
    let rotation = 0;
    if (videoStream.side_data_list) {
      const dispMatrix = videoStream.side_data_list.find(
        (sd: any) => sd.side_data_type === 'Display Matrix',
      );
      if (dispMatrix && dispMatrix.rotation) rotation = dispMatrix.rotation;
    }
    if (!rotation && videoStream.tags && videoStream.tags.rotate) {
      rotation = Number(videoStream.tags.rotate);
    }

    console.log(`   - Video Codec: ${codecName} (${codecTag})`);
    console.log(`   - Container: ${container}`);
    console.log(`   - Resolution: ${resolution} (Rotation: ${rotation}°)`);
    console.log(`   - Bitrate: ${bitrate}`);
    console.log(`   - Audio Codec: ${audioStream.codec_name || 'none'}`);

    // D. Browser Playback Tests (Edge & Firefox)
    console.log(`4. Browser Playback Tests:`);

    // Edge
    const edgeCtx = await edgeBrowser.newContext();
    await edgeCtx.addCookies([
      {
        name: cookieHeader.split('=')[0],
        value: cookieHeader.split('=')[1],
        url: baseUrl,
      },
    ]);
    const edgePage = await edgeCtx.newPage();
    await edgePage.goto(
      `${baseUrl}/player?fileId=${video.id}&mime=${encodeURIComponent(video.mime_type)}&codec=${encodeURIComponent(codecTag)}`,
    );
    await edgePage.waitForTimeout(3000);
    const edgeResult = await edgePage.evaluate(() => (window as any).__videoTest);
    await edgeCtx.close();
    console.log(
      `   - Edge: canPlayCodec="${edgeResult.canPlayCodec}", started=${edgeResult.startedPlayback}, error=${JSON.stringify(edgeResult.error)}, events=[${edgeResult.events.join(', ')}]`,
    );

    // Firefox
    const ffCtx = await firefoxBrowser.newContext();
    await ffCtx.addCookies([
      {
        name: cookieHeader.split('=')[0],
        value: cookieHeader.split('=')[1],
        url: baseUrl,
      },
    ]);
    const ffPage = await ffCtx.newPage();
    await ffPage.goto(
      `${baseUrl}/player?fileId=${video.id}&mime=${encodeURIComponent(video.mime_type)}&codec=${encodeURIComponent(codecTag)}`,
    );
    await ffPage.waitForTimeout(3000);
    const ffResult = await ffPage.evaluate(() => (window as any).__videoTest);
    await ffCtx.close();
    console.log(
      `   - Firefox: canPlayCodec="${ffResult.canPlayCodec}", started=${ffResult.startedPlayback}, error=${JSON.stringify(ffResult.error)}, events=[${ffResult.events.join(', ')}]`,
    );

    // Determine Verdict
    let verdict: string;
    const streamHealthy = r1MatchesFull && r2MatchesFull && r3MatchesFull;

    if (!streamHealthy) {
      verdict = 'STREAM_BUG';
    } else if (codecName === 'hevc' || codecTag.includes('hvc') || codecTag.includes('hev')) {
      verdict = 'CODEC_UNSUPPORTED_IN_BROWSER';
    } else if (edgeResult.startedPlayback && ffResult.startedPlayback) {
      verdict = 'OK';
    } else if (!edgeResult.startedPlayback && !ffResult.startedPlayback) {
      verdict = 'BAD_FILE';
    } else {
      verdict = 'CODEC_UNSUPPORTED_IN_BROWSER';
    }

    console.log(`   => VERDICT: ${verdict}`);

    diagnosisResults.push({
      fileClass: video.classType,
      idPrefix: video.id.slice(0, 10),
      name: video.name,
      size: video.size_bytes,
      mime: video.mime_type,
      codec: `${codecName} (${codecTag})`,
      container,
      resolution: `${resolution} (${rotation}°)`,
      bitrate,
      moovPosition: atomInfo.position,
      streamStatus206: streamHealthy ? 'PASS (hashes match)' : 'FAIL',
      pastEofStatus: pastStatus,
      edgePlayback: edgeResult.startedPlayback
        ? 'PASS'
        : `FAIL (${edgeResult.error?.message || edgeResult.error?.code || 'no play'})`,
      firefoxPlayback: ffResult.startedPlayback
        ? 'PASS'
        : `FAIL (${ffResult.error?.message || ffResult.error?.code || 'decode error'})`,
      verdict,
    });
  }

  await edgeBrowser.close();
  await firefoxBrowser.close();
  await server.close();

  console.log('\n========================================================================');
  console.log('SUMMARY TABLE');
  console.log('========================================================================\n');
  console.table(diagnosisResults);

  // Generate markdown verdict table for docs/audits/01b-video-and-scroll.md
  let mdTable =
    '| File Class | ID Prefix | File Name | Codec (FourCC) | Container | Moov Position | Stream Test | Edge Playback | Firefox Playback | Verdict |\n';
  mdTable += '|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of diagnosisResults) {
    mdTable += `| ${r.fileClass} | \`${r.idPrefix}\` | ${r.name} | ${r.codec} | ${r.container} | ${r.moovPosition} | ${r.streamStatus206} | ${r.edgePlayback} | ${r.firefoxPlayback} | **${r.verdict}** |\n`;
  }

  console.log('\nMarkdown Output:\n');
  console.log(mdTable);

  fs.writeFileSync(
    path.join(tempDir, 'diagnosis-results.json'),
    JSON.stringify(diagnosisResults, null, 2),
  );
}

runDiagnosis().catch((err) => {
  console.error('Diagnosis failed:', err);
  process.exit(1);
});
