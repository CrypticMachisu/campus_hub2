-- Migration: allow a report to target one photo on a post.
--
-- A photo is a separate moderation target from its dispatch: a member may
-- object to an image without the whole post being removed. `target_id` still
-- references the polymorphic target; the API checks that the photo is ready
-- and its post is published before accepting the report.
--
-- Run this AFTER 022:
--
--   DB_NAME=campushub_standalone npm run migrate

ALTER TABLE reports
    MODIFY COLUMN target_type ENUM('post', 'comment', 'media') NOT NULL;
