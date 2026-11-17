-- Migration: photos attached to club posts.
--
-- A media row starts as `pending` when the API issues a presigned upload.
-- Once the browser uploads and the post is created, the route checks the
-- object with HeadObject and attaches the row to the post as `ready`.
-- Pending rows let an upload exist before the post does without publishing a
-- half-finished dispatch. `post_id` stays nullable until that attach step.
--
-- Run this AFTER 018:
--
--   DB_NAME=campushub_standalone npm run migrate

CREATE TABLE IF NOT EXISTS post_media (
    media_id       VARCHAR(64)  PRIMARY KEY,                 -- e.g. 'media-<uuid>'
    post_id        VARCHAR(64)  NULL,
    club_id        VARCHAR(30)  NOT NULL,
    uploader_id    VARCHAR(30)  NULL,
    storage_key    VARCHAR(255) NOT NULL,
    alt_text       VARCHAR(300) NOT NULL DEFAULT '',
    decorative     TINYINT(1)   NOT NULL DEFAULT 0,
    width          INT          NULL,
    height         INT          NULL,
    mime           VARCHAR(80)  NOT NULL,
    position       TINYINT UNSIGNED NOT NULL DEFAULT 0,
    status         ENUM('pending', 'ready') NOT NULL DEFAULT 'pending',
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_post_media_post
        FOREIGN KEY (post_id) REFERENCES posts(post_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_post_media_club
        FOREIGN KEY (club_id) REFERENCES clubs(club_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_post_media_uploader
        FOREIGN KEY (uploader_id) REFERENCES users(user_id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    UNIQUE KEY uq_post_media_key (storage_key),
    INDEX idx_post_media_post (post_id, position),
    INDEX idx_post_media_pending (status, created_at)
) ENGINE=InnoDB;
