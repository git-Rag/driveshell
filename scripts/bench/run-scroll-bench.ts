/**
 * run-scroll-bench.ts — Orchestrator for B1 baseline measurement (Dev vs Prod Preview)
 */

import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { runScrollBenchmark, type ScrollBenchmarkMetrics } from './scroll-bench';

const repoRoot = path.resolve(__dirname, '../..');

async function waitForHttp(url: string, timeoutMs = 15000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.status < 500) return true;
    } catch {
      // wait and retry
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

function startProcess(cmd: string, args: string[], cwd: string): ChildProcess {
  const child = spawn(cmd, args, {
    cwd,
    stdio: 'pipe',
    shell: true,
    env: { ...process.env, BROWSER: 'none' },
  });
  return child;
}

async function main() {
  console.log('========================================================================');
  console.log('DriveShell Part B1: Benchmarking Dev vs Prod Preview on ~5,700 Items');
  console.log('========================================================================\n');

  // 1. Start Server
  console.log('Starting Fastify backend server on port 3001...');
  const serverProc = startProcess(
    'pnpm',
    ['--filter', '@driveshell/server', 'run', 'start'],
    repoRoot,
  );
  const serverReady = await waitForHttp('http://127.0.0.1:3001/health', 15000);
  if (!serverReady) {
    console.log('Built dist not found, running tsx dev server instead...');
    serverProc.kill();
    const devServerProc = startProcess(
      'pnpm',
      ['--filter', '@driveshell/server', 'run', 'dev'],
      repoRoot,
    );
    const devServerReady = await waitForHttp('http://127.0.0.1:3001/health', 15000);
    if (!devServerReady) {
      console.error('Failed to start server on port 3001!');
      devServerProc.kill();
      process.exit(1);
    }
  }

  const results: ScrollBenchmarkMetrics[] = [];

  try {
    // 2. Measure Dev Server
    console.log('\n--- 1. Testing DEV Mode ---');
    const devVite = startProcess(
      'pnpm',
      ['--filter', '@driveshell/web', 'exec', 'vite', '--port', '5173'],
      repoRoot,
    );
    await waitForHttp('http://127.0.0.1:5173', 15000);
    const devMetrics = await runScrollBenchmark('http://127.0.0.1:5173', 'dev');
    results.push(devMetrics);
    devVite.kill();

    // 3. Measure Prod Preview
    console.log('\n--- 2. Testing PROD PREVIEW Mode ---');
    console.log('Building web bundle...');
    const buildChild = spawn('pnpm', ['--filter', '@driveshell/web', 'run', 'build'], {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: true,
    });
    await new Promise<void>((resolve, reject) => {
      buildChild.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`Build exited with code ${code}`)),
      );
    });

    const previewVite = startProcess(
      'pnpm',
      ['--filter', '@driveshell/web', 'exec', 'vite', 'preview', '--port', '4173'],
      repoRoot,
    );
    await waitForHttp('http://127.0.0.1:4173', 15000);
    const previewMetrics = await runScrollBenchmark('http://127.0.0.1:4173', 'preview');
    results.push(previewMetrics);
    previewVite.kill();
  } finally {
    serverProc.kill();
  }

  console.log('\n========================================================================');
  console.log('B1 BASELINE BENCHMARK COMPARISON TABLE');
  console.log('========================================================================\n');
  console.table(results);
}

main().catch((err) => {
  console.error('Benchmark suite error:', err);
  process.exit(1);
});
