/**
 * bundle-bench.ts — Inspect web frontend production bundle size by chunk and gzip size.
 */

import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';

interface ChunkStat {
  filename: string;
  sizeBytes: number;
  gzipBytes: number;
}

function analyzeBundle(): {
  chunks: ChunkStat[];
  totalSizeBytes: number;
  totalGzipBytes: number;
  initialJsGzip: number;
} {
  const distDir = path.resolve(__dirname, '../../apps/web/dist/assets');
  if (!fs.existsSync(distDir)) {
    throw new Error(`dist directory not found: ${distDir}. Run pnpm build first.`);
  }

  const files = fs.readdirSync(distDir);
  const chunks: ChunkStat[] = [];
  let totalSizeBytes = 0;
  let totalGzipBytes = 0;
  let initialJsGzip = 0;

  for (const f of files) {
    const fullPath = path.join(distDir, f);
    const content = fs.readFileSync(fullPath);
    const gzipped = zlib.gzipSync(content);
    const size = content.length;
    const gzipSize = gzipped.length;

    totalSizeBytes += size;
    totalGzipBytes += gzipSize;

    if (f.endsWith('.js') && f.startsWith('index-')) {
      initialJsGzip = gzipSize;
    }

    chunks.push({
      filename: f,
      sizeBytes: size,
      gzipBytes: gzipSize,
    });
  }

  return {
    chunks,
    totalSizeBytes,
    totalGzipBytes,
    initialJsGzip,
  };
}

function main() {
  console.log('🏁 Running Web Bundle Benchmark...\n');
  const res = analyzeBundle();
  console.log('=== Web Production Bundle Chunks ===');
  for (const c of res.chunks) {
    console.log(
      `  ${c.filename.padEnd(35)} ${(c.sizeBytes / 1024).toFixed(2).padStart(8)} KB (raw) | ${(c.gzipBytes / 1024).toFixed(2).padStart(8)} KB (gzip)`,
    );
  }
  console.log('----------------------------------------------------');
  console.log(
    `  Initial JS Bundle (gzip):          ${(res.initialJsGzip / 1024).toFixed(2)} KB (budget: < 150 KB)`,
  );
  console.log(
    `  Total Bundle Size (raw / gzip):    ${(res.totalSizeBytes / 1024).toFixed(2)} KB / ${(res.totalGzipBytes / 1024).toFixed(2)} KB`,
  );
}

main();
