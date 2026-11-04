import BetterSqlite3 from 'better-sqlite3';
import path from 'node:path';
import { extractMediaDate } from '../src/sync/drive-api';

const DB_PATH = path.resolve(__dirname, '..', 'data', 'driveshell.db');
const db = new BetterSqlite3(DB_PATH);

const files = db
  .prepare<[], { id: string; name: string; modified_at: number; taken_at: number | null }>(
    `SELECT id, name, modified_at, taken_at FROM files WHERE mime_type LIKE 'image/%' OR mime_type LIKE 'video/%'`,
  )
  .all();

console.log('Total media files in DB:', files.length);

const update = db.prepare<[number | null, string]>('UPDATE files SET taken_at = ? WHERE id = ?');
let updated = 0;

const tx = db.transaction(() => {
  for (const f of files) {
    const parsed = extractMediaDate(null, f.name, null);
    update.run(parsed, f.id);
    if (parsed) updated++;
  }
});

tx();
console.log('Fixed taken_at on:', updated, 'valid media files!');

const months = db
  .prepare<[], { month_key: string; total: number }>(
    `SELECT
      strftime('%Y-%m', datetime(CASE WHEN taken_at IS NOT NULL THEN taken_at/1000 ELSE modified_at/1000 END, 'unixepoch')) AS month_key,
      COUNT(*) AS total
    FROM files
    WHERE mime_type LIKE 'image/%' OR mime_type LIKE 'video/%'
    GROUP BY month_key
    ORDER BY month_key DESC
    LIMIT 25`,
  )
  .all();

console.log('Clean Month distributions:');
console.table(months);

db.close();
