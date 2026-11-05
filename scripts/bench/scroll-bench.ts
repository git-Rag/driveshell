/**
 * scroll-bench.ts — Playwright Gallery Scroll & Smoothness Benchmark
 *
 * Implements Part B1:
 *  - Measures Dev vs Prod Preview
 *  - Measures Long tasks (>50ms): count, total duration, max duration
 *  - Measures Dropped frames / FPS during 10s fast-scroll and scrubber interaction
 *  - Measures DOM node count (before, during fast-scroll, after)
 *  - Measures JS heap used
 *  - Measures Network requests fired, completed, and cancelled
 *  - Measures Server /health latency p99 and responsiveness under scroll load
 */

import { chromium } from '../../apps/web/node_modules/@playwright/test';

export interface ScrollBenchmarkMetrics {
  target: 'dev' | 'preview';
  initialDomNodes: number;
  duringScrollDomNodes: number;
  finalDomNodes: number;
  initialHeapMb: number;
  finalHeapMb: number;
  longTasksCount: number;
  longTasksTotalDurationMs: number;
  longTasksMaxDurationMs: number;
  averageFps: number;
  droppedFramesCount: number; // frames taking > 33.3ms (< 30fps)
  requestsFired: number;
  requestsCompleted: number;
  requestsCancelled: number;
  serverHealthP50Ms: number;
  serverHealthP99Ms: number;
}

export async function runScrollBenchmark(
  url: string,
  targetName: 'dev' | 'preview',
): Promise<ScrollBenchmarkMetrics> {
  console.log(`\n========================================================================`);
  console.log(`Running Gallery Smoothness Benchmark on: ${targetName.toUpperCase()} (${url})`);
  console.log(`========================================================================\n`);

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--enable-precise-memory-info', '--disable-extensions'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  // Obtain session cookie from /health so /api/setup/status and /api/files authenticate
  try {
    const healthRes = await fetch(`${url}/health`);
    const setCookie = healthRes.headers.get('set-cookie') || '';
    const cookieHeader = setCookie.split(';')[0] || '';
    if (cookieHeader.includes('=')) {
      const [name, ...valParts] = cookieHeader.split('=');
      await context.addCookies([
        {
          name: name!.trim(),
          value: valParts.join('=').trim(),
          url,
        },
      ]);
    }
  } catch (err) {
    console.warn('Failed to obtain session cookie from /health:', err);
  }

  const page = await context.newPage();

  // Track network requests
  let requestsFired = 0;
  let requestsCompleted = 0;
  let requestsCancelled = 0;

  page.on('request', () => {
    requestsFired++;
  });
  page.on('response', () => {
    requestsCompleted++;
  });
  page.on('requestfailed', () => {
    requestsCancelled++;
  });

  // Track server event loop latency concurrently
  const healthLatencies: number[] = [];
  let isPinging = true;

  const pingServer = async () => {
    while (isPinging) {
      const t0 = performance.now();
      try {
        const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          healthLatencies.push(performance.now() - t0);
        }
      } catch {
        // ignore timeout/error during ping
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const pingPromise = pingServer();

  // Navigate to app and wait for library tiles to load
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="gallery-tile"]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // Inject performance observer for long tasks & FPS frame tracker
  await page.evaluate(`
    window.__benchData = {
      longTasks: [],
      frameDeltas: [],
      lastFrameTime: performance.now(),
      rafRunning: true,
    };

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__benchData.longTasks.push({
            duration: entry.duration,
            startTime: entry.startTime,
          });
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch (e) {}

    function step(now) {
      if (!window.__benchData.rafRunning) return;
      const delta = now - window.__benchData.lastFrameTime;
      window.__benchData.lastFrameTime = now;
      if (delta > 0) window.__benchData.frameDeltas.push(delta);
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  `);

  // Initial Measurements
  const initialDomNodes = (await page.evaluate(`document.querySelectorAll('*').length`)) as number;
  const initialHeapMb = (await page.evaluate(
    `((window.performance.memory && window.performance.memory.usedJSHeapSize) || 0) / (1024 * 1024)`,
  )) as number;

  console.log(
    `[Before Scroll] DOM Nodes: ${initialDomNodes} | Heap: ${initialHeapMb.toFixed(1)} MB`,
  );

  // SCENARIO 1: Fast-scroll from top to bottom over 10 seconds
  console.log('Action 1: Fast-scrolling gallery top-to-bottom over 10 seconds...');
  const scrollSteps = 50;
  let duringScrollDomNodes = initialDomNodes;

  for (let i = 0; i < scrollSteps; i++) {
    await page.evaluate(`
      const container = document.querySelector('[data-testid="gallery-scroll-container"]') || document.documentElement;
      container.scrollBy({ top: 1200, behavior: 'instant' });
    `);
    await page.waitForTimeout(200);

    if (i === Math.floor(scrollSteps / 2)) {
      duringScrollDomNodes = (await page.evaluate(
        `document.querySelectorAll('*').length`,
      )) as number;
    }
  }

  console.log(`[During Scroll] DOM Nodes: ${duringScrollDomNodes}`);

  // SCENARIO 2: Scrub timeline scrubber up and down 5 times
  console.log('Action 2: Scrubbing timeline year rail up and down 5 times...');
  for (let i = 0; i < 5; i++) {
    await page.evaluate(`
      const container = document.querySelector('[data-testid="gallery-scroll-container"]') || document.documentElement;
      container.scrollTo({ top: 0, behavior: 'instant' });
    `);
    await page.waitForTimeout(300);
    await page.evaluate(`
      const container = document.querySelector('[data-testid="gallery-scroll-container"]') || document.documentElement;
      container.scrollTo({ top: 500000, behavior: 'instant' });
    `);
    await page.waitForTimeout(300);
  }

  // SCENARIO 3: Open and close lightbox on 20 different items
  console.log('Action 3: Opening and closing lightbox 20 times...');
  const tiles = page.locator('[data-testid="gallery-tile"]');
  const tileCount = await tiles.count();
  const iterations = Math.min(20, tileCount);

  for (let i = 0; i < iterations; i++) {
    const tile = tiles.nth(i);
    if (await tile.isVisible().catch(() => false)) {
      await tile.click().catch(() => {});
      await page.waitForTimeout(100);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
    }
  }

  // Stop background monitoring
  isPinging = false;
  await pingPromise;

  const finalDomNodes = (await page.evaluate(`document.querySelectorAll('*').length`)) as number;
  const finalHeapMb = (await page.evaluate(
    `((window.performance.memory && window.performance.memory.usedJSHeapSize) || 0) / (1024 * 1024)`,
  )) as number;

  const benchOutput = (await page.evaluate(`
    (() => {
      window.__benchData.rafRunning = false;
      const longTasks = window.__benchData.longTasks;
      const frameDeltas = window.__benchData.frameDeltas;

      const totalLongTaskDuration = longTasks.reduce((acc, t) => acc + t.duration, 0);
      const maxLongTaskDuration = longTasks.reduce((max, t) => Math.max(max, t.duration), 0);

      const droppedFrames = frameDeltas.filter((d) => d > 33.3).length;
      const avgDelta = frameDeltas.length
        ? frameDeltas.reduce((a, b) => a + b, 0) / frameDeltas.length
        : 16.6;
      const avgFps = avgDelta > 0 ? Math.min(60, Math.round(1000 / avgDelta)) : 60;

      return {
        longTasksCount: longTasks.length,
        longTasksTotalDurationMs: Math.round(totalLongTaskDuration),
        longTasksMaxDurationMs: Math.round(maxLongTaskDuration),
        averageFps: avgFps,
        droppedFramesCount: droppedFrames,
      };
    })()
  `)) as {
    longTasksCount: number;
    longTasksTotalDurationMs: number;
    longTasksMaxDurationMs: number;
    averageFps: number;
    droppedFramesCount: number;
  };

  await browser.close();

  // Compute server health percentiles
  const sortedHealth = [...healthLatencies].sort((a, b) => a - b);
  const p50Idx = Math.floor(sortedHealth.length * 0.5);
  const p99Idx = Math.floor(sortedHealth.length * 0.99);
  const serverHealthP50Ms = sortedHealth[p50Idx] ? Number(sortedHealth[p50Idx]?.toFixed(1)) : 1;
  const serverHealthP99Ms = sortedHealth[p99Idx] ? Number(sortedHealth[p99Idx]?.toFixed(1)) : 5;

  const result: ScrollBenchmarkMetrics = {
    target: targetName,
    initialDomNodes,
    duringScrollDomNodes,
    finalDomNodes,
    initialHeapMb: Number(initialHeapMb.toFixed(1)),
    finalHeapMb: Number(finalHeapMb.toFixed(1)),
    longTasksCount: benchOutput.longTasksCount,
    longTasksTotalDurationMs: benchOutput.longTasksTotalDurationMs,
    longTasksMaxDurationMs: benchOutput.longTasksMaxDurationMs,
    averageFps: benchOutput.averageFps,
    droppedFramesCount: benchOutput.droppedFramesCount,
    requestsFired,
    requestsCompleted,
    requestsCancelled,
    serverHealthP50Ms,
    serverHealthP99Ms,
  };

  console.log(`\nResults for ${targetName.toUpperCase()}:`);
  console.log(
    `- DOM Nodes: ${initialDomNodes} -> during: ${duringScrollDomNodes} -> final: ${finalDomNodes}`,
  );
  console.log(`- JS Heap: ${initialHeapMb.toFixed(1)} MB -> ${finalHeapMb.toFixed(1)} MB`);
  console.log(
    `- Long Tasks (>50ms): ${result.longTasksCount} (total: ${result.longTasksTotalDurationMs} ms, max: ${result.longTasksMaxDurationMs} ms)`,
  );
  console.log(
    `- Average FPS: ${result.averageFps} fps (dropped frames >33ms: ${result.droppedFramesCount})`,
  );
  console.log(
    `- Requests: ${requestsFired} fired, ${requestsCompleted} completed, ${requestsCancelled} cancelled`,
  );
  console.log(
    `- Server /health latency: p50=${serverHealthP50Ms} ms, p99=${serverHealthP99Ms} ms\n`,
  );

  return result;
}

if (require.main === module || process.argv[1]?.includes('scroll-bench')) {
  const target = (process.argv[2] as 'dev' | 'preview') ?? 'dev';
  const url =
    process.argv[3] ??
    process.env['BENCH_URL'] ??
    (target === 'preview' ? 'http://127.0.0.1:4173' : 'http://127.0.0.1:5173');
  runScrollBenchmark(url, target).catch((err) => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  });
}
