import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../data/backups/diagnose_20261105-101736/driveshell.db');
const db = new Database(dbPath, { readonly: true });

console.log('=== DIAGNOSTIC REPORT ON BACKUP DB ===');
console.log('DB Path:', dbPath);

// Current gallery filter logic:
const MEDIA_STRICT_FILTER = `
  (
    (
      mime_type LIKE 'image/%'
      OR mime_type LIKE 'video/%'
      OR lower(name) LIKE '%.jpg'
      OR lower(name) LIKE '%.jpeg'
      OR lower(name) LIKE '%.png'
      OR lower(name) LIKE '%.gif'
      OR lower(name) LIKE '%.webp'
      OR lower(name) LIKE '%.heic'
      OR lower(name) LIKE '%.heif'
      OR lower(name) LIKE '%.bmp'
      OR lower(name) LIKE '%.tiff'
      OR lower(name) LIKE '%.tif'
      OR lower(name) LIKE '%.avif'
      OR lower(name) LIKE '%.raw'
      OR lower(name) LIKE '%.dng'
      OR lower(name) LIKE '%.cr2'
      OR lower(name) LIKE '%.nef'
      OR lower(name) LIKE '%.arw'
      OR lower(name) LIKE '%.mp4'
      OR lower(name) LIKE '%.mov'
      OR lower(name) LIKE '%.avi'
      OR lower(name) LIKE '%.mkv'
      OR lower(name) LIKE '%.webm'
      OR lower(name) LIKE '%.3gp'
      OR lower(name) LIKE '%.m4v'
    )
    AND mime_type != 'application/vnd.google-apps.folder'
    AND mime_type NOT LIKE 'application/vnd.google-apps.%'
    AND NOT (
      lower(name) LIKE '%.pdf'
      OR lower(name) LIKE '%.doc%'
      OR lower(name) LIKE '%.xls%'
      OR lower(name) LIKE '%.ppt%'
      OR lower(name) LIKE '%.zip'
      OR lower(name) LIKE '%.rar'
      OR lower(name) LIKE '%.tar%'
      OR lower(name) LIKE '%.json'
      OR lower(name) LIKE '%.txt'
      OR lower(name) LIKE '%.html'
      OR lower(name) LIKE '%.css'
      OR lower(name) LIKE '%.js'
      OR lower(name) LIKE '%.ts'
      OR lower(name) LIKE '%.exe'
      OR lower(name) LIKE '%.apk'
      OR lower(name) LIKE '%.dmg'
      OR lower(name) LIKE '%.iso'
    )
  )
`;

// Total files in DB
const totalFiles = db.prepare('SELECT count(*) as count FROM files').get() as { count: number };
const nonTrashedFiles = db.prepare('SELECT count(*) as count FROM files WHERE trashed = 0').get() as { count: number };
const currentGalleryCount = db.prepare(`SELECT count(*) as count FROM files WHERE trashed = 0 AND ${MEDIA_STRICT_FILTER}`).get() as { count: number };

console.log(`\n1. Overall DB Counts:`);
console.log(`- Total indexed files: ${totalFiles.count}`);
console.log(`- Non-trashed files: ${nonTrashedFiles.count}`);
console.log(`- Currently treated as media by Gallery: ${currentGalleryCount.count}`);

// Count files by mime_type among current gallery media
const mimeBreakdown = db.prepare(`
  SELECT mime_type, count(*) as count 
  FROM files 
  WHERE trashed = 0 AND ${MEDIA_STRICT_FILTER} 
  GROUP BY mime_type 
  ORDER BY count DESC
`).all() as { mime_type: string; count: number }[];

console.log(`\n2. Mime Type Breakdown in Gallery (Total: ${currentGalleryCount.count}):`);
for (const row of mimeBreakdown) {
  console.log(`  - ${row.mime_type.padEnd(35)} : ${row.count}`);
}

// Check columns in files table
const columns = db.prepare("PRAGMA table_info('files')").all() as { name: string; type: string }[];
console.log(`\n3. Columns in files table:`);
console.log(columns.map(c => `${c.name} (${c.type})`).join(', '));

const hasDurationMs = columns.some(c => c.name === 'duration_ms');

// Video rows with/without width and height and duration_ms
const videoRowsTotal = db.prepare(`
  SELECT count(*) as count 
  FROM files 
  WHERE trashed = 0 AND mime_type LIKE 'video/%'
`).get() as { count: number };

const videoWithDimensions = db.prepare(`
  SELECT count(*) as count 
  FROM files 
  WHERE trashed = 0 AND mime_type LIKE 'video/%' AND (image_width IS NOT NULL OR image_height IS NOT NULL)
`).get() as { count: number };

const videoWithoutDimensions = db.prepare(`
  SELECT count(*) as count 
  FROM files 
  WHERE trashed = 0 AND mime_type LIKE 'video/%' AND image_width IS NULL AND image_height IS NULL
`).get() as { count: number };

console.log(`\n4. Video Rows Metadata Analysis (mime_type LIKE 'video/%'):`);
console.log(`  - Total video/* rows: ${videoRowsTotal.count}`);
console.log(`  - With dimensions (image_width OR image_height): ${videoWithDimensions.count}`);
console.log(`  - Without dimensions (image_width AND image_height both null): ${videoWithoutDimensions.count}`);
console.log(`  - duration_ms column exists: ${hasDurationMs}`);

// Rows with .ts/.mts/.cts/.d.ts/.d.mts/.d.cts names
const tsPatternCount = db.prepare(`
  SELECT count(*) as count
  FROM files
  WHERE trashed = 0 AND (
    lower(name) LIKE '%.ts'
    OR lower(name) LIKE '%.mts'
    OR lower(name) LIKE '%.cts'
    OR lower(name) LIKE '%.d.ts'
    OR lower(name) LIKE '%.d.mts'
    OR lower(name) LIKE '%.d.cts'
  )
`).get() as { count: number };

const tsPatternInGallery = db.prepare(`
  SELECT count(*) as count
  FROM files
  WHERE trashed = 0 AND ${MEDIA_STRICT_FILTER} AND (
    lower(name) LIKE '%.ts'
    OR lower(name) LIKE '%.mts'
    OR lower(name) LIKE '%.cts'
    OR lower(name) LIKE '%.d.ts'
    OR lower(name) LIKE '%.d.mts'
    OR lower(name) LIKE '%.d.cts'
  )
`).get() as { count: number };

console.log(`\n5. TypeScript Filename Rows (.ts / .mts / .cts / .d.ts / .d.mts / .d.cts):`);
console.log(`  - Total matching rows in DB: ${tsPatternCount.count}`);
console.log(`  - Rows leaking into Gallery: ${tsPatternInGallery.count}`);

// Extension breakdown of the TS pattern leaking rows
const extensionBreakdown = db.prepare(`
  SELECT 
    CASE 
      WHEN lower(name) LIKE '%.d.mts' THEN '.d.mts'
      WHEN lower(name) LIKE '%.d.cts' THEN '.d.cts'
      WHEN lower(name) LIKE '%.d.ts' THEN '.d.ts'
      WHEN lower(name) LIKE '%.mts' THEN '.mts'
      WHEN lower(name) LIKE '%.cts' THEN '.cts'
      WHEN lower(name) LIKE '%.ts' THEN '.ts'
      ELSE 'other'
    END as ext,
    mime_type,
    count(*) as count
  FROM files
  WHERE trashed = 0 AND ${MEDIA_STRICT_FILTER} AND (
    lower(name) LIKE '%.ts'
    OR lower(name) LIKE '%.mts'
    OR lower(name) LIKE '%.cts'
    OR lower(name) LIKE '%.d.ts'
    OR lower(name) LIKE '%.d.mts'
    OR lower(name) LIKE '%.d.cts'
  )
  GROUP BY ext, mime_type
  ORDER BY count DESC
`).all();

console.log(`\n6. Breakdown of Leaking TypeScript Files by Extension & Mime Type:`);
console.table(extensionBreakdown);

// 10 Sample leaking filenames
const samples = db.prepare(`
  SELECT id, name, mime_type, image_width, image_height, thumbnail_url
  FROM files
  WHERE trashed = 0 AND ${MEDIA_STRICT_FILTER} AND (
    lower(name) LIKE '%.mts'
    OR lower(name) LIKE '%.cts'
    OR lower(name) LIKE '%.ts'
  )
  LIMIT 10
`).all();

console.log(`\n7. Sample 10 Leaking Files (Minimal Info):`);
console.table(samples.map((s: any) => ({
  name: s.name,
  mime_type: s.mime_type,
  width: s.image_width,
  height: s.image_height,
  has_thumb: Boolean(s.thumbnail_url),
})));

// Real video sample
const realVideos = db.prepare(`
  SELECT id, name, mime_type, image_width, image_height, thumbnail_url, size_bytes
  FROM files
  WHERE trashed = 0 AND mime_type LIKE 'video/%' AND lower(name) NOT LIKE '%.mts'
  LIMIT 10
`).all();
console.log(`\n8. Sample Real Video Rows:`);
console.table(realVideos);

// Check folders matching HIDDEN_FOLDER_NAMES
const hiddenFolderNames = ['node_modules', '.git', '__pycache__', '.venv'];
const hiddenFolders = db.prepare(`
  SELECT id, name, mime_type, parent_id
  FROM files
  WHERE name IN (${hiddenFolderNames.map(n => `'${n}'`).join(',')})
`).all() as { id: string; name: string; mime_type: string; parent_id: string }[];

console.log(`\n9. Matching Hidden Folders in DB:`, hiddenFolders.length);
console.table(hiddenFolders);

// Recursive CTE to find all descendants of these hidden folders
const descendantQuery = `
  WITH RECURSIVE hidden_tree AS (
    SELECT id, name FROM files WHERE name IN (${hiddenFolderNames.map(n => `'${n}'`).join(',')})
    UNION ALL
    SELECT f.id, f.name FROM files f
    JOIN hidden_tree ht ON f.parent_id = ht.id
  )
  SELECT count(*) as count FROM hidden_tree
`;
const totalHiddenDescendants = db.prepare(descendantQuery).get() as { count: number };
console.log(`\n10. Total Descendants of Hidden Folders:`, totalHiddenDescendants.count);

// How many hidden descendants are currently in the gallery?
const hiddenInGalleryQuery = `
  WITH RECURSIVE hidden_tree AS (
    SELECT id, name FROM files WHERE name IN (${hiddenFolderNames.map(n => `'${n}'`).join(',')})
    UNION ALL
    SELECT f.id, f.name FROM files f
    JOIN hidden_tree ht ON f.parent_id = ht.id
  )
  SELECT count(*) as count FROM files
  WHERE trashed = 0 
    AND ${MEDIA_STRICT_FILTER}
    AND id IN (SELECT id FROM hidden_tree)
`;
const hiddenInGallery = db.prepare(hiddenInGalleryQuery).get() as { count: number };
console.log(`\n11. Hidden Folder Descendants Currently in Gallery:`, hiddenInGallery.count);

// Breakdown of hidden in gallery by extension or mime
const hiddenInGalleryBreakdown = db.prepare(`
  WITH RECURSIVE hidden_tree AS (
    SELECT id, name FROM files WHERE name IN (${hiddenFolderNames.map(n => `'${n}'`).join(',')})
    UNION ALL
    SELECT f.id, f.name FROM files f
    JOIN hidden_tree ht ON f.parent_id = ht.id
  )
  SELECT mime_type, count(*) as count FROM files
  WHERE trashed = 0 
    AND ${MEDIA_STRICT_FILTER}
    AND id IN (SELECT id FROM hidden_tree)
  GROUP BY mime_type
  ORDER BY count DESC
`).all();
console.log(`\n12. Mime breakdown of hidden descendants in Gallery:`);
console.table(hiddenInGalleryBreakdown);

// If we exclude hidden descendants AND exclude .ts/.mts/.cts/.d.ts/.d.mts/.d.cts:
const cleanGalleryQuery = `
  WITH RECURSIVE hidden_tree AS (
    SELECT id, name FROM files WHERE name IN (${hiddenFolderNames.map(n => `'${n}'`).join(',')})
    UNION ALL
    SELECT f.id, f.name FROM files f
    JOIN hidden_tree ht ON f.parent_id = ht.id
  )
  SELECT count(*) as count FROM files
  WHERE trashed = 0 
    AND ${MEDIA_STRICT_FILTER}
    AND id NOT IN (SELECT id FROM hidden_tree)
    AND NOT (
      lower(name) LIKE '%.ts'
      OR lower(name) LIKE '%.mts'
      OR lower(name) LIKE '%.cts'
      OR lower(name) LIKE '%.d.ts'
      OR lower(name) LIKE '%.d.mts'
      OR lower(name) LIKE '%.d.cts'
    )
`;
const cleanGalleryCount = db.prepare(cleanGalleryQuery).get() as { count: number };
console.log(`\n13. Clean Gallery Count (Current filter - hidden folders - TS extensions):`, cleanGalleryCount.count);

// 14. What are the 6,495 items?
const remainingBreakdown = db.prepare(`
  WITH RECURSIVE hidden_tree AS (
    SELECT id FROM files WHERE name IN (${hiddenFolderNames.map(n => `'${n}'`).join(',')})
    UNION ALL
    SELECT f.id FROM files f JOIN hidden_tree ht ON f.parent_id = ht.id
  )
  SELECT mime_type, count(*) as count FROM files
  WHERE trashed = 0 
    AND ${MEDIA_STRICT_FILTER}
    AND id NOT IN (SELECT id FROM hidden_tree)
    AND NOT (
      lower(name) LIKE '%.ts'
      OR lower(name) LIKE '%.mts'
      OR lower(name) LIKE '%.cts'
      OR lower(name) LIKE '%.d.ts'
      OR lower(name) LIKE '%.d.mts'
      OR lower(name) LIKE '%.d.cts'
    )
  GROUP BY mime_type
  ORDER BY count DESC
`).all();
console.log(`\n14. Breakdown of remaining 6,495 clean media by mime_type:`);
console.table(remainingBreakdown);

// Let's check videos among the remaining:
const remainingVideos = db.prepare(`
  WITH RECURSIVE hidden_tree AS (
    SELECT id FROM files WHERE name IN (${hiddenFolderNames.map(n => `'${n}'`).join(',')})
    UNION ALL
    SELECT f.id FROM files f JOIN hidden_tree ht ON f.parent_id = ht.id
  )
  SELECT mime_type, count(*) as count FROM files
  WHERE trashed = 0 
    AND ${MEDIA_STRICT_FILTER}
    AND id NOT IN (SELECT id FROM hidden_tree)
    AND mime_type LIKE 'video/%'
  GROUP BY mime_type
`).all();
console.log(`\n15. Video types in clean media:`);
console.table(remainingVideos);

// Check if any files have duration or video metadata
const hasVideoMetadataInDriveApi = db.prepare(`
  SELECT count(*) as count FROM files WHERE thumbnail_url IS NOT NULL AND mime_type LIKE 'video/%'
`).get();
console.log(`\n16. Videos with thumbnail_url:`, hasVideoMetadataInDriveApi);

// 17. Check taken_at counts
const takenAtNotNull = db.prepare(`SELECT count(*) as count FROM files WHERE taken_at IS NOT NULL`).get();
console.log(`\n17. Files with taken_at IS NOT NULL:`, takenAtNotNull);

// What about videos with duration/dimensions in DB?
const videosWithAnyMetadata = db.prepare(`
  SELECT count(*) as count FROM files 
  WHERE mime_type LIKE 'video/%' 
    AND (image_width IS NOT NULL OR image_height IS NOT NULL)
`).get();
console.log(`18. Videos with width/height:`, videosWithAnyMetadata);

const videosTotal = db.prepare(`SELECT count(*) as count FROM files WHERE mime_type LIKE 'video/%'`).get();
console.log(`19. Total videos:`, videosTotal);

// Videos with thumbnail
const videosWithThumb = db.prepare(`SELECT count(*) as count FROM files WHERE mime_type LIKE 'video/%' AND thumbnail_url IS NOT NULL`).get();
console.log(`20. Videos with thumbnail:`, videosWithThumb);

// Check if any .d.mts or .ts have thumbnail
const tsWithThumb = db.prepare(`
  SELECT count(*) as count FROM files 
  WHERE (lower(name) LIKE '%.ts' OR lower(name) LIKE '%.mts' OR lower(name) LIKE '%.cts')
    AND thumbnail_url IS NOT NULL
`).get();
console.log(`21. TypeScript pattern files with thumbnail:`, tsWithThumb);

db.close();
