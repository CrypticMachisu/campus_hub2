-- Migration: club posts.
--
-- A post is a dated dispatch from one club officer. It is deliberately not a
-- general social object: one club, one named author snapshot, text only for
-- now. Status lets a manager hide a post (reversible) or mark it removed
-- without deleting the row, so comments and reports never dangle.
--
-- Run this AFTER 001–017:
--
--   DB_NAME=campushub_standalone npm run migrate

CREATE TABLE IF NOT EXISTS posts (
    post_id               VARCHAR(64)  PRIMARY KEY,   -- e.g. 'post-<timestamp>'
    club_id               VARCHAR(30)  NOT NULL,
    author_id             VARCHAR(30)  NULL,
    author_name_snapshot  VARCHAR(100) NOT NULL,
    body                  TEXT         NOT NULL,
    status                ENUM('published', 'hidden', 'removed') NOT NULL DEFAULT 'published',
    created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_posts_club
        FOREIGN KEY (club_id) REFERENCES clubs(club_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_posts_author
        FOREIGN KEY (author_id) REFERENCES users(user_id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    INDEX idx_posts_club_created (club_id, status, created_at),
    INDEX idx_posts_status_created (status, created_at)
) ENGINE=InnoDB;
