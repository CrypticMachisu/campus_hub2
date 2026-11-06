-- Migration: threaded replies, pinned comments, and reactions
-- Run this AFTER 001–006.
--
--   mysql -u root campushub < server/migrations/007_comment_threads.sql
--
-- The discussion thread was flat, so a reply was indistinguishable from a new
-- point and an admin had no way to surface the answer everyone needs. This adds
-- one level of replies (parent_id), a pinned flag, and a reaction table.
--
-- One level only: the API rejects a parent that is itself a reply, which keeps
-- the thread readable and the UI simple.
--
-- Not idempotent — re-running errors on the duplicate column, harmlessly.


ALTER TABLE comments
    ADD COLUMN parent_id VARCHAR(30) NULL,
    ADD COLUMN pinned    TINYINT(1)  NOT NULL DEFAULT 0,
    ADD INDEX idx_comments_parent (parent_id),
    ADD CONSTRAINT fk_comments_parent
        FOREIGN KEY (parent_id) REFERENCES comments(comment_id)
        ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS comment_reactions (
    comment_id VARCHAR(30) NOT NULL,
    user_id    VARCHAR(30) NOT NULL,
    emoji      VARCHAR(16) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (comment_id, user_id, emoji),
    CONSTRAINT fk_reactions_comment
        FOREIGN KEY (comment_id) REFERENCES comments(comment_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_reactions_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;
