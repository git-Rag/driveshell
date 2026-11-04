/**
 * seed.ts — Generate a synthetic 100k-row SQLite database for DriveShell performance testing.
 *
 * Implements realistic distributions matching real-world Google Drive data:
 *   - 80% images (jpg, png, heic, webp), 10% videos (mp4, mov, mkv), 10% docs/other
 *   - Dates distributed over 5 years with burst days (trips/holidays: 200+ items/day)
 *   - Folder hierarchy with depths 1-6, including dedicated folders for:
 *       * folder-synth-50: exactly 50 direct children
 *       * folder-synth-2000: exactly 2,000 direct children
 *   - Realistic filenames: varying lengths, punctuation, multilingual Unicode (Japanese, Spanish, Arabic, Hindi)
 *   - ~5% starred, ~1% trashed
 *   - ~20 albums with 50-500 photos each in albums/album_items tables
 *   - Realistic thumbnail paths
 *   - Re-runnable and idempotent with --clean
 *
 * Usage:
 *   npx tsx scripts/seed.ts [--clean] [--dest data/bench/synthetic-100k/driveshell.db] [--count 100000]
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const args = process.argv.slice(2);
const shouldClean = args.includes('--clean');
const destIdx = args.indexOf('--dest');
const countIdx = args.indexOf('--count');

const TARGET_COUNT =
  countIdx !== -1 && args[countIdx + 1] ? parseInt(args[countIdx + 1]!, 10) : 100_000;
const DB_RELATIVE =
  destIdx !== -1 && args[destIdx + 1]
    ? args[destIdx + 1]!
    : 'data/bench/synthetic-100k/driveshell.db';

const REPO_ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.resolve(REPO_ROOT, DB_RELATIVE);
const SEED_ACCOUNT = 'seed-account-001';

console.log(`\n🌱 DriveShell Synthetic Dataset Generator`);
console.log(`   Target DB: ${DB_PATH}`);
console.log(`   Target Count: ${TARGET_COUNT.toLocaleString()}`);
console.log(`   Clean mode: ${shouldClean}\n`);

// Ensure directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

if (shouldClean) {
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  if (fs.existsSync(`${DB_PATH}-wal`)) fs.unlinkSync(`${DB_PATH}-wal`);
  if (fs.existsSync(`${DB_PATH}-shm`)) fs.unlinkSync(`${DB_PATH}-shm`);
  console.log(`🧹 Cleaned existing database files at ${DB_PATH}`);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// 1. Run migrations to ensure exact schema
const MIGRATIONS_DIR = path.resolve(REPO_ROOT, 'apps/server/migrations');
const migrationFiles = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

db.exec(`
  CREATE TABLE IF NOT EXISTS schema_version (
    version    INTEGER NOT NULL,
    applied_at INTEGER NOT NULL
  );
`);

const currentVerRow = db
  .prepare<[], { v: number }>('SELECT MAX(version) AS v FROM schema_version')
  .get();
const currentVer = currentVerRow?.v ?? 0;

for (const file of migrationFiles) {
  const ver = parseInt(file.split('_')[0]!, 10);
  if (ver > currentVer) {
    console.log(`   Applying migration ${file}...`);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    db.exec(sql);
  }
}

// 2. Ensure seed account exists
db.prepare(
  `
  INSERT OR IGNORE INTO accounts (
    id, email, display_name, avatar_url, scope_level, status, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`,
).run(
  SEED_ACCOUNT,
  'seed.user@example.com',
  'Synthetic Benchmark User',
  'https://lh3.googleusercontent.com/a/default-user',
  'readonly',
  'ok',
  Date.now() - 5 * 365 * 24 * 3600 * 1000,
);

// Check existing file count
const existingCount =
  db
    .prepare<[string], { c: number }>('SELECT COUNT(*) AS c FROM files WHERE account_id = ?')
    .get(SEED_ACCOUNT)?.c ?? 0;

if (existingCount >= TARGET_COUNT && !shouldClean) {
  console.log(
    `✨ DB already contains ${existingCount.toLocaleString()} rows for ${SEED_ACCOUNT}. Nothing to do.`,
  );
  db.close();
  process.exit(0);
}

// 3. Distributions setup
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'];
const VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/x-matroska'];
const DOC_MIMES = [
  'application/pdf',
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/zip',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const CAMERA_MAKES = ['Apple', 'Samsung', 'Google', 'Sony', 'Canon', 'Nikon'];
const CAMERA_MODELS: Record<string, string[]> = {
  Apple: ['iPhone 13', 'iPhone 14 Pro', 'iPhone 15 Pro Max'],
  Samsung: ['Galaxy S22', 'Galaxy S23 Ultra', 'Galaxy S24'],
  Google: ['Pixel 7', 'Pixel 8 Pro', 'Pixel 9'],
  Sony: ['A7 IV', 'A7R V', 'ZV-E10'],
  Canon: ['EOS R5', 'EOS R6 Mark II'],
  Nikon: ['Z6 II', 'Z8'],
};

// Multilingual name fragments
const NAME_PREFIXES = [
  'IMG',
  'DCIM',
  'Photo',
  'Vacation',
  'Receipt',
  'Report',
  'Invoice',
  'Backup',
  'Proyecto',
  'Foto_Familia',
  'Viagem',
  'Reise_Berlin',
  '旅行_東京',
  '写真',
  '書類',
  '会議メモ', // Japanese
  'تقرير_مالي',
  'صور_الرحلة', // Arabic
  'यात्रा_तस्वीरें',
  'दस्तावेज़', // Hindi
  'Capture [v2.1]',
  'Scan (Final)',
  'Draft #3 & Notes',
  'Meeting - Q3/Q4',
];

const NOW = Date.now();
const FIVE_YEARS_MS = 5 * 365 * 24 * 3600 * 1000;

// Precompute burst days (15 burst events over 5 years, each event lasting 2-4 days)
const BURST_DATES: number[] = [];
for (let b = 0; b < 25; b++) {
  BURST_DATES.push(NOW - Math.floor(Math.random() * FIVE_YEARS_MS));
}

function generateTimestamp(idx: number): { modifiedAt: number; takenAt: number | null } {
  // 30% of items fall into burst days
  let ts: number;
  if (idx % 10 < 3) {
    const burstBase = BURST_DATES[idx % BURST_DATES.length]!;
    ts = burstBase + Math.floor((Math.random() - 0.5) * 24 * 3600 * 1000);
  } else {
    ts = NOW - Math.floor(Math.random() * FIVE_YEARS_MS);
  }
  const takenAt = Math.random() > 0.15 ? ts - Math.floor(Math.random() * 5000) : null;
  return { modifiedAt: ts, takenAt };
}

// 4. Create Folder Hierarchy
const FOLDERS: string[] = ['root'];
// Depth 1: 10 folders
for (let i = 0; i < 10; i++) FOLDERS.push(`folder-d1-${i}`);
// Depth 2: 25 folders
for (let i = 0; i < 25; i++) FOLDERS.push(`folder-d2-${i}`);
// Depth 3: 50 folders
for (let i = 0; i < 50; i++) FOLDERS.push(`folder-d3-${i}`);
// Depth 4: 50 folders
for (let i = 0; i < 50; i++) FOLDERS.push(`folder-d4-${i}`);
// Depth 5: 30 folders
for (let i = 0; i < 30; i++) FOLDERS.push(`folder-d5-${i}`);
// Depth 6: 20 folders
for (let i = 0; i < 20; i++) FOLDERS.push(`folder-d6-${i}`);

const FOLDER_50 = 'folder-synth-50';
const FOLDER_2000 = 'folder-synth-2000';

const insertFile = db.prepare(`
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

const BATCH_SIZE = 1000;
let inserted = existingCount;
const startTime = performance.now();

const insertBatch = db.transaction((rows: any[]) => {
  for (const r of rows) {
    insertFile.run(r);
  }
});

console.log(`🚀 Seeding files from ${inserted} to ${TARGET_COUNT}...`);

// Insert folders themselves first if needed
const folderRows: any[] = [];
for (const f of [...FOLDERS, FOLDER_50, FOLDER_2000]) {
  if (f === 'root') continue;
  folderRows.push({
    account_id: SEED_ACCOUNT,
    id: f,
    name: `Directory_${f}`,
    mime_type: 'application/vnd.google-apps.folder',
    parent_id: f.includes('d2') ? 'folder-d1-0' : f.includes('d3') ? 'folder-d2-0' : null,
    size_bytes: null,
    modified_at: NOW - 1000000,
    created_at_ms: NOW - 2000000,
    starred: 0,
    trashed: 0,
    thumbnail_url: null,
    web_view_link: `https://drive.google.com/drive/folders/${f}`,
    image_width: null,
    image_height: null,
    taken_at: null,
    camera_make: null,
    camera_model: null,
  });
}
insertBatch(folderRows);

// Insert files in batches
while (inserted < TARGET_COUNT) {
  const rows: any[] = [];
  const currentBatchLimit = Math.min(BATCH_SIZE, TARGET_COUNT - inserted);

  for (let b = 0; b < currentBatchLimit; b++) {
    const i = inserted + b;
    const fileId = `synth-file-${String(i).padStart(7, '0')}`;
    const rand = Math.random();

    // 80% images, 10% videos, 10% docs
    let mime: string;
    let ext: string;
    let isImage = false;
    let isVideo = false;

    if (rand < 0.8) {
      isImage = true;
      const imgIdx = i % IMAGE_MIMES.length;
      mime = IMAGE_MIMES[imgIdx]!;
      ext =
        mime === 'image/jpeg'
          ? 'jpg'
          : mime === 'image/png'
            ? 'png'
            : mime === 'image/heic'
              ? 'heic'
              : 'webp';
    } else if (rand < 0.9) {
      isVideo = true;
      const vidIdx = i % VIDEO_MIMES.length;
      mime = VIDEO_MIMES[vidIdx]!;
      ext = mime === 'video/mp4' ? 'mp4' : mime === 'video/quicktime' ? 'mov' : 'mkv';
    } else {
      const docIdx = i % DOC_MIMES.length;
      mime = DOC_MIMES[docIdx]!;
      ext = mime.includes('pdf') ? 'pdf' : mime.includes('zip') ? 'zip' : 'txt';
    }

    const { modifiedAt, takenAt } = generateTimestamp(i);
    const prefix = NAME_PREFIXES[i % NAME_PREFIXES.length]!;
    const name = `${prefix}_${String(i).padStart(6, '0')}.${ext}`;

    // Parent folder distribution:
    // First 50 items go to FOLDER_50
    // Next 2000 items go to FOLDER_2000
    // Remaining distributed across depths 1-6
    let parentId: string | null;
    if (i < 50) {
      parentId = FOLDER_50;
    } else if (i < 2050) {
      parentId = FOLDER_2000;
    } else {
      parentId = FOLDERS[i % FOLDERS.length]!;
      if (parentId === 'root') parentId = null;
    }

    // ~5% starred, ~1% trashed
    const starred = Math.random() < 0.05 ? 1 : 0;
    const trashed = Math.random() < 0.01 ? 1 : 0;

    const make = isImage || isVideo ? CAMERA_MAKES[i % CAMERA_MAKES.length]! : null;
    const models = make ? CAMERA_MODELS[make]! : null;
    const model = models ? models[i % models.length]! : null;

    rows.push({
      account_id: SEED_ACCOUNT,
      id: fileId,
      name,
      mime_type: mime,
      parent_id: parentId,
      size_bytes: isImage
        ? Math.floor(Math.random() * 8_000_000) + 500_000
        : isVideo
          ? Math.floor(Math.random() * 150_000_000) + 10_000_000
          : Math.floor(Math.random() * 5_000_000) + 10_000,
      modified_at: modifiedAt,
      created_at_ms: modifiedAt - Math.floor(Math.random() * 3600000),
      starred,
      trashed,
      thumbnail_url:
        isImage || isVideo
          ? `https://lh3.googleusercontent.com/drive-viewer/mock-${fileId}=s220`
          : null,
      web_view_link: `https://drive.google.com/file/d/${fileId}/view`,
      image_width: isImage ? (i % 2 === 0 ? 4032 : 3024) : null,
      image_height: isImage ? (i % 2 === 0 ? 3024 : 4032) : null,
      taken_at: isImage || isVideo ? takenAt : null,
      camera_make: make,
      camera_model: model,
    });
  }

  insertBatch(rows);
  inserted += rows.length;

  if (inserted % 10000 === 0 || inserted === TARGET_COUNT) {
    const pct = ((inserted / TARGET_COUNT) * 100).toFixed(1);
    process.stdout.write(
      `\r   [${pct}%] ${inserted.toLocaleString()} / ${TARGET_COUNT.toLocaleString()} files written...`,
    );
  }
}
process.stdout.write('\n');

// 5. Seed Albums (~20 albums with 50-500 photos each)
console.log(`📸 Seeding 20 albums with 50-500 photos each...`);
const ALBUM_NAMES = [
  'Summer Roadtrip',
  'Tokyo Explorations',
  'Family Christmas',
  'Paris Weekend',
  'Hiking Alps',
  'Wedding Highlights',
  'Beach Days',
  'Food & Coffee',
  'Architecture & Design',
  'City Lights',
  'Portraits 2024',
  'Cats & Dogs',
  'Garden & Nature',
  'Concerts & Events',
  'Drone Shots',
  'Sunsets & Skies',
  'Random Memories',
  'Project Snapshots',
  'Autumn Colors',
  'Best of 5 Years',
];

const insertAlbum = db.prepare(`
  INSERT OR IGNORE INTO albums (id, account_id, title, description, cover_file_id, created_at, modified_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const insertAlbumItem = db.prepare(`
  INSERT OR IGNORE INTO album_items (album_id, file_id, added_at)
  VALUES (?, ?, ?)
`);

// Pick candidate image files for albums
const sampleImages = db
  .prepare<[string], { id: string }>(
    `
  SELECT id FROM files
  WHERE account_id = ? AND mime_type LIKE 'image/%' AND trashed = 0
  LIMIT 10000
`,
  )
  .all(SEED_ACCOUNT);

const albumBatch = db.transaction(() => {
  let imgCursor = 0;
  for (let a = 0; a < ALBUM_NAMES.length; a++) {
    const albumId = `synth-album-${String(a + 1).padStart(3, '0')}`;
    const title = ALBUM_NAMES[a]!;
    const photoCount = 50 + Math.floor(Math.random() * 450); // 50 to 500 photos
    const coverId = sampleImages[imgCursor]?.id ?? null;
    const albumTime = NOW - Math.floor(Math.random() * FIVE_YEARS_MS);

    insertAlbum.run(
      albumId,
      SEED_ACCOUNT,
      title,
      `Curated album of ${title}`,
      coverId,
      albumTime,
      albumTime,
    );

    for (let p = 0; p < photoCount; p++) {
      if (imgCursor >= sampleImages.length) imgCursor = 0;
      const fileId = sampleImages[imgCursor]!.id;
      insertAlbumItem.run(albumId, fileId, albumTime + p * 1000);
      imgCursor++;
    }
  }
});
albumBatch();

const totalDuration = ((performance.now() - startTime) / 1000).toFixed(2);
const finalFiles =
  db
    .prepare<[string], { c: number }>('SELECT COUNT(*) AS c FROM files WHERE account_id = ?')
    .get(SEED_ACCOUNT)?.c ?? 0;
const finalAlbums =
  db
    .prepare<[string], { c: number }>('SELECT COUNT(*) AS c FROM albums WHERE account_id = ?')
    .get(SEED_ACCOUNT)?.c ?? 0;
const finalAlbumItems =
  db.prepare<[], { c: number }>('SELECT COUNT(*) AS c FROM album_items').get()?.c ?? 0;

db.close();

console.log(`\n🎉 Synthetic Seeding Complete!`);
console.log(`   Total time: ${totalDuration}s`);
console.log(`   Files: ${finalFiles.toLocaleString()}`);
console.log(`   Albums: ${finalAlbums.toLocaleString()}`);
console.log(`   Album Items: ${finalAlbumItems.toLocaleString()}`);
console.log(`   Target DB: ${DB_PATH}\n`);
