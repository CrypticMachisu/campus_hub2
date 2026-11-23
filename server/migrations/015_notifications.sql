-- Migration: targeted in-app notices.
--
-- Commitments need a way to tell the people who signed up that a notice moved
-- or was cancelled. A club announcement is too broad for that. Each row belongs
-- to one user and optionally links back to the thing that changed; read_at is
-- the only mutable state, so unread counts stay a cheap query.
--
-- Run this AFTER 001–014:
--
--   DB_NAME=campushub_standalone npm run migrate

CREATE TABLE IF NOT EXISTS notifications (
    notification_id VARCHAR(64)  PRIMARY KEY,
    user_id         VARCHAR(30)  NOT NULL,
    kind            VARCHAR(40)  NOT NULL,          -- commitment_rescheduled | commitment_cancelled | …
    title           VARCHAR(200) NOT NULL,
    body            TEXT         NULL,
    link            VARCHAR(255) NULL,              -- app path, e.g. /commitments/agro-opp-01
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at         DATETIME     NULL,
    INDEX idx_notifications_user_created (user_id, created_at),
    INDEX idx_notifications_unread (user_id, read_at),
    CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;
