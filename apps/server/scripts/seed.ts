/**
 * seed.ts — Insert 100,000 synthetic file rows for performance testing.
 *
 * Uses a fake accountId ('seed-account-001') to avoid FK constraint issues.
 * Writes in batches of 1,000 rows per transaction.
 *
 * Usage: pnpm seed
 *        (or: npx tsx scripts/seed.ts)
 *
 * WARNING: This script is for local dev/perf testing only.
 *          It disables foreign keys temporarily.
 *          Never run against a production DB.
 */

import BetterSqlite3 from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const TOTAL = 100_000;
const BATCH = 1_000;
const SEED_ACCOUNT = 'seed-account-001';

const DATA_DIR = process.env['DATA_DIR'] ?? path.resolve(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'driveshell.db');

console.log(`\n🌱 DriveShell seed script`);
console.log(`   DB: ${DB_PATH}`);
console.log(`   Rows to insert: ${TOTAL.toLocaleString()}\n`);

const db = new BetterSqlite3(DB_PATH);

// Apply WAL + temporarily disable FK constraints for the seed
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF'); // seed account has no row in accounts table

const insert = db.prepare<{
  account_id: string;
  id: string;
  name: string;
  mime_type: string;
  parent_id: string | null;
  size_bytes: number | null;
  modified_at: number;
  created_at_ms: number;
  starred: number;
  trashed: number;
  thumbnail_url: string | null;
  web_view_link: string | null;
  image_width: number | null;
  image_height: number | null;
  taken_at: number | null;
  camera_make: string | null;
  camera_model: string | null;
}>(`
  INSERT OR IGNORE INTO files (
    account_id, id, name, mime_type, parent_id,
    size_bytes, modified_at, created_at_ms,
    starred, trashed,
    thumbnail_url, web_view_link,
    image_width, image_height,
    taken_at, camera_make, camera_model
  ) VALUES (
    @account_id, @id, @name, @mime_type, @parent_id,
    @size_bytes, @modified_at, @created_at_ms,
    @starred, @trashed,
    @thumbnail_url, @web_view_link,
    @image_width, @image_height,
    @taken_at, @camera_make, @camera_model
  )
`);

const MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'application/pdf',
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/zip',
  'text/plain',
  'application/vnd.ms-excel',
];

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/webp']);

const CAMERA_MAKES = ['Apple', 'Samsung', 'Google', 'Sony', 'Canon', 'Nikon'];
const CAMERA_MODELS = [
  'iPhone 15 Pro',
  'Galaxy S24',
  'Pixel 9',
  'Sony A7IV',
  'EOS R6',
  'Z9',
];

const NOW = Date.now();
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function pickMime(i: number): string {
  return MIME_TYPES[i % MIME_TYPES.length]!;
}

function makeName(i: number, mime: string): string {
  if (mime.startsWith('image/jpeg')) return `IMG_${String(i).padStart(6, '0')}.jpg`;
  if (mime.startsWith('image/png')) return `Screenshot_2024_${String(i).padStart(5, '0')}.png`;
  if (mime.startsWith('image/heic')) return `PHOTO_${String(i).padStart(6, '0')}.heic`;
  if (mime.startsWith('image/webp')) return `export_${i}.webp`;
  if (mime.startsWith('video/mp4')) return `VID_${String(i).padStart(6, '0')}.mp4`;
  if (mime.startsWith('video/')) return `Movie_${i}.mov`;
  if (mime.includes('pdf')) return `Document_${i}.pdf`;
  if (mime.includes('document')) return `Doc_${i} - Notes`;
  if (mime.includes('spreadsheet')) return `Sheet_${i} - Data`;
  if (mime.includes('zip')) return `archive_${i}.zip`;
  if (mime.includes('excel')) return `report_${i}.xlsx`;
  return `file_${i}.txt`;
}

const batchFn = db.transaction((rows: Parameters<typeof insert.run>[0][]) => {
  for (const row of rows) {
    insert.run(row);
  }
});

let inserted = 0;
const startTime = Date.now();

for (let batch = 0; batch < TOTAL / BATCH; batch++) {
  const rows: Parameters<typeof insert.run>[0][] = [];

  for (let i = 0; i < BATCH; i++) {
    const idx = batch * BATCH + i;
    const mime = pickMime(idx);
    const isImage = IMAGE_MIMES.has(mime);
    const modifiedAt = NOW - Math.floor(Math.random() * ONE_YEAR_MS);
    const takenAt = isImage && Math.random() > 0.3 ? modifiedAt - Math.floor(Math.random() * 1000) : null;
    const cameraIdx = idx % CAMERA_MAKES.length;

    rows.push({
      account_id: SEED_ACCOUNT,
      id: `seed-file-${idx}`,
      name: makeName(idx, mime),
      mime_type: mime,
      parent_id: idx % 100 === 0 ? null : `seed-folder-${Math.floor(idx / 50)}`,
      size_bytes: Math.floor(Math.random() * 50_000_000) + 1024,
      modified_at: modifiedAt,
      created_at_ms: modifiedAt - Math.floor(Math.random() * 1000 * 60),
      starred: idx % 200 === 0 ? 1 : 0,
      trashed: idx % 1000 === 0 ? 1 : 0,
      thumbnail_url: null,
      web_view_link: `https://drive.google.com/file/d/seed-file-${idx}/view`,
      image_width: isImage ? [1920, 3024, 4032, 5120][idx % 4]! : null,
      image_height: isImage ? [1080, 4032, 3024, 2880][idx % 4]! : null,
      taken_at: takenAt,
      camera_make: takenAt ? (CAMERA_MAKES[cameraIdx] ?? null) : null,
      camera_model: takenAt ? (CAMERA_MODELS[cameraIdx] ?? null) : null,
    });
  }

  batchFn(rows);
  inserted += rows.length;

  if (batch % 10 === 0) {
    const pct = Math.round((inserted / TOTAL) * 100);
    process.stdout.write(`\r   ${pct}%  ${inserted.toLocaleString()} / ${TOTAL.toLocaleString()} rows`);
  }
}

process.stdout.write('\n');

// Verify
const countRow = db.prepare<[], { total: number }>(`SELECT COUNT(*) AS total FROM files WHERE account_id = ?`).get(SEED_ACCOUNT);
const finalCount = countRow?.total ?? 0;

db.pragma('foreign_keys = ON');
db.close();

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\n✅ Seed complete`);
console.log(`   Rows in DB for '${SEED_ACCOUNT}': ${finalCount.toLocaleString()}`);
console.log(`   Time: ${elapsed}s\n`);

if (finalCount < TOTAL) {
  console.warn(`⚠️  Expected ${TOTAL.toLocaleString()} rows, got ${finalCount.toLocaleString()}.`);
  console.warn(`   Duplicate IDs may have been skipped (run again to top up).\n`);
}

