-- ---------------------------------------------------------------------------
-- 005_optimization.sql — Database Index and Query Optimization (Stage 5)
-- ---------------------------------------------------------------------------

-- 1. Optimized compound expression index for Photo Timeline queries
-- Matches: WHERE account_id = ? AND trashed = 0 ORDER BY COALESCE(taken_at, modified_at) DESC
CREATE INDEX IF NOT EXISTS idx_files_photos_timeline_fast
  ON files(account_id, COALESCE(taken_at, modified_at) DESC)
  WHERE trashed = 0;

-- 2. Covering index for File Browser navigation
-- Matches: WHERE account_id = ? AND parent_id = ? AND trashed = 0 ORDER BY modified_at DESC
CREATE INDEX IF NOT EXISTS idx_files_browse_covering
  ON files(account_id, parent_id, trashed, modified_at DESC);

-- 3. Optimized index for album photo lookups
CREATE INDEX IF NOT EXISTS idx_album_items_covering
  ON album_items(album_id, added_at DESC, file_id);

-- ---------------------------------------------------------------- version
INSERT INTO schema_version (version, applied_at)
VALUES (5, unixepoch() * 1000);
