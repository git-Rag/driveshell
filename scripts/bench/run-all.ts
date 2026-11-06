/**
 * run-all.ts — Master benchmark runner for DriveShell.
 * Runs DB, Server, Bundle, and Sync benchmarks and outputs the complete scoreboard.
 *
 * Usage:
 *   pnpm --filter @driveshell/server exec tsx ../../scripts/bench/run-all.ts
 */

import { execSync } from 'node:child_process';
import path from 'node:path';

function runScript(title: string, scriptFile: string) {
  console.log(`\n======================================================`);
  console.log(`🚀 ${title}`);
  console.log(`======================================================\n`);
  const fullPath = path.resolve(__dirname, scriptFile);
  const out = execSync(`pnpm --filter @driveshell/server exec tsx "${fullPath}"`, {
    cwd: path.resolve(__dirname, '../../'),
    encoding: 'utf8',
  });
  console.log(out);
}

function main() {
  console.log('🏎️  DRIVESHELL PERFORMANCE & BASELINE HARNESS');
  console.log(`Timestamp: ${new Date().toISOString()}`);

  runScript('1. DATABASE BENCHMARKS (25k Real vs 100k Synthetic)', 'db-bench.ts');
  runScript('2. SERVER BENCHMARKS (Cold start, RSS, Throughput, Event Loop)', 'server-bench.ts');
  runScript('3. WEB PRODUCTION BUNDLE (Chunks & Gzip payloads)', 'bundle-bench.ts');
  runScript('4. SYNC ENGINE BENCHMARK (Full & Incremental Throughput)', 'sync-bench.ts');

  console.log('\n✅ All benchmarks completed successfully.\n');
}

main();
