-- Migration: store a generated thumbnail for each published photo.
--
-- The original stays in the bucket for the permalink and fallback. A publish
-- generates a 640px WebP variant before the media row is attached, and stores
-- its key here. Rows created before this migration have NULL and keep using
-- the original until they are replaced.
--
-- Run this AFTER 023:
--
--   DB_NAME=campushub_standalone npm run migrate

ALTER TABLE post_media
    ADD COLUMN thumbnail_key VARCHAR(255) NULL AFTER storage_key;
