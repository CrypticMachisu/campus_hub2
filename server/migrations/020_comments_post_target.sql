-- Migration: allow comments on posts.
--
-- comments.target_type already covers events, clubs and commitments. Posts
-- are the fourth discussion surface; widening the ENUM keeps every existing
-- row and every existing thread exactly as it is.
--
-- Run this AFTER 018:
--
--   DB_NAME=campushub_standalone npm run migrate

ALTER TABLE comments
    MODIFY COLUMN target_type ENUM('event', 'club', 'commitment', 'post') NOT NULL;
