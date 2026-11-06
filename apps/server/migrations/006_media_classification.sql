-- ---------------------------------------------------------------------------
-- 006_media_classification.sql — Media classification and code folder exclusion
-- ---------------------------------------------------------------------------

-- 1. Add columns for video metadata and media classification
ALTER TABLE files ADD COLUMN duration_ms INTEGER;
ALTER TABLE files ADD COLUMN is_media INTEGER NOT NULL DEFAULT 0;
ALTER TABLE files ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;
ALTER TABLE files ADD COLUMN hidden_reason TEXT;

-- 2. Mark hidden code folders and all their descendants using recursive CTE
-- Constants: node_modules, .git, __pycache__, .venv
WITH RECURSIVE hidden_tree AS (
  SELECT id, account_id, name AS root_folder
  FROM files
  WHERE name IN ('node_modules', '.git', '__pycache__', '.venv')

  UNION ALL

  SELECT f.id, f.account_id, ht.root_folder
  FROM files f
  JOIN hidden_tree ht ON f.parent_id = ht.id AND f.account_id = ht.account_id
)
UPDATE files
SET is_hidden = 1,
    hidden_reason = 'descendant_of_' || (
      SELECT ht.root_folder
      FROM hidden_tree ht
      WHERE ht.id = files.id AND ht.account_id = files.account_id
      LIMIT 1
    )
WHERE id IN (SELECT id FROM hidden_tree);

-- 3. Mark is_media = 1 for existing media rows
-- Rules:
--  - image/* counts as media (preserves HEIC, HEIF, RAW, etc.)
--  - video/* counts ONLY if Drive provided video metadata (duration_ms not null, or width and height not null)
--  - Names ending .ts, .mts, .cts, .d.ts, .d.mts, .d.cts are NEVER media unless they have video metadata
--  - Real AVCHD .MTS/.M2TS videos with video metadata are media
--  - Non-media extensions (.pdf, .json, .txt, .js, .html, etc.) are excluded
UPDATE files
SET is_media = 1
WHERE (
  (
    mime_type LIKE 'image/%'
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
  )
  OR
  (
    (
      mime_type LIKE 'video/%'
      OR lower(name) LIKE '%.mp4'
      OR lower(name) LIKE '%.mov'
      OR lower(name) LIKE '%.avi'
      OR lower(name) LIKE '%.mkv'
      OR lower(name) LIKE '%.webm'
      OR lower(name) LIKE '%.3gp'
      OR lower(name) LIKE '%.m4v'
      OR lower(name) LIKE '%.mts'
      OR lower(name) LIKE '%.m2ts'
    )
    AND (
      (duration_ms IS NOT NULL AND duration_ms > 0)
      OR (image_width IS NOT NULL AND image_height IS NOT NULL AND image_width > 0 AND image_height > 0)
    )
  )
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
  OR (
    (
      lower(name) LIKE '%.ts'
      OR lower(name) LIKE '%.mts'
      OR lower(name) LIKE '%.cts'
      OR lower(name) LIKE '%.d.ts'
      OR lower(name) LIKE '%.d.mts'
      OR lower(name) LIKE '%.d.cts'
    )
    AND NOT (
      (duration_ms IS NOT NULL AND duration_ms > 0)
      OR (image_width IS NOT NULL AND image_height IS NOT NULL AND image_width > 0 AND image_height > 0)
    )
  )
  OR lower(name) LIKE '%.exe'
  OR lower(name) LIKE '%.apk'
  OR lower(name) LIKE '%.dmg'
  OR lower(name) LIKE '%.iso'
);

-- 4. Fast indexes for gallery and timeline views
CREATE INDEX IF NOT EXISTS idx_files_media_lookup
  ON files(account_id, is_media, is_hidden, trashed);

CREATE INDEX IF NOT EXISTS idx_files_gallery_timeline
  ON files(account_id, COALESCE(taken_at, modified_at) DESC)
  WHERE is_media = 1 AND is_hidden = 0 AND trashed = 0;

-- 5. Version bump
INSERT INTO schema_version (version, applied_at)
VALUES (6, unixepoch() * 1000);
