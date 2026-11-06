-- ---------------------------------------------------------------------------
-- 007_video_classification.sql — Restore real videos without requiring metadata
-- ---------------------------------------------------------------------------
-- Rules:
--  - video/* counts as media, EXCEPT video/mp2t.
--  - video/mp2t counts as media only WITH metadata AND only if the name is not .ts/.cts/.d.ts/.d.mts/.d.cts.
--  - All image/* continue to count as media.
--  - Non-media extensions (.pdf, .txt, .js, .json, etc.) and hidden items are excluded.

-- 1. Reclassify files: mark is_media = 1 for non-mp2t video/* files
UPDATE files
SET is_media = 1
WHERE mime_type LIKE 'video/%'
  AND mime_type != 'video/mp2t'
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
    OR lower(name) LIKE '%.cts'
    OR lower(name) LIKE '%.d.ts'
    OR lower(name) LIKE '%.d.mts'
    OR lower(name) LIKE '%.d.cts'
  );

-- 2. For video/mp2t, only mark is_media = 1 if it has metadata AND is not a TS code file
UPDATE files
SET is_media = 1
WHERE mime_type = 'video/mp2t'
  AND (
    (duration_ms IS NOT NULL AND duration_ms > 0)
    OR (image_width IS NOT NULL AND image_height IS NOT NULL AND image_width > 0 AND image_height > 0)
  )
  AND NOT (
    lower(name) LIKE '%.ts'
    OR lower(name) LIKE '%.cts'
    OR lower(name) LIKE '%.d.ts'
    OR lower(name) LIKE '%.d.mts'
    OR lower(name) LIKE '%.d.cts'
  );

-- ---------------------------------------------------------------- version
INSERT INTO schema_version (version, applied_at)
VALUES (7, unixepoch() * 1000);
