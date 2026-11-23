-- Migration: pin one standing notice per club.
--
-- A club's ordinary dispatches stay reverse chronological. An officer can pin
-- one published post so a standing notice (meeting time, joining instructions)
-- does not disappear down the page. `pinned_at` is the timestamp the pin was
-- set; the API clears every other pin in the club when a post is pinned.
--
-- Run this AFTER 021:
--
--   DB_NAME=campushub_standalone npm run migrate

ALTER TABLE posts
    ADD COLUMN pinned_at DATETIME NULL AFTER status,
    ADD INDEX idx_posts_club_pinned (club_id, status, pinned_at);
