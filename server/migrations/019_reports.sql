-- Migration: content reports and their moderation outcome.
--
-- A report is a member's flag on a post or a comment. club_id is denormalized
-- so an officer's queue is one indexed read, and the target itself is checked
-- by the API because the reference is polymorphic. A unique key stops one
-- member from piling reports onto the same item; more than one member can
-- still report it, which is what `reportCount` in the queue represents.
--
-- Run this AFTER 018:
--
--   DB_NAME=campushub_standalone npm run migrate

CREATE TABLE IF NOT EXISTS reports (
    report_id    INT AUTO_INCREMENT PRIMARY KEY,
    target_type  ENUM('post', 'comment') NOT NULL,
    target_id    VARCHAR(64) NOT NULL,
    club_id      VARCHAR(30) NOT NULL,
    reporter_id  VARCHAR(30) NOT NULL,
    reason       ENUM('spam', 'harassment', 'off_topic', 'other') NOT NULL,
    note         VARCHAR(500) NULL,
    status       ENUM('open', 'actioned', 'dismissed') NOT NULL DEFAULT 'open',
    resolution   ENUM('hidden', 'removed', 'dismissed') NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at  DATETIME NULL,
    resolved_by  VARCHAR(30) NULL,
    CONSTRAINT fk_reports_club
        FOREIGN KEY (club_id) REFERENCES clubs(club_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_reports_reporter
        FOREIGN KEY (reporter_id) REFERENCES users(user_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_reports_resolver
        FOREIGN KEY (resolved_by) REFERENCES users(user_id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    UNIQUE KEY uq_report_once (reporter_id, target_type, target_id),
    INDEX idx_reports_club_status (club_id, status, created_at),
    INDEX idx_reports_target (target_type, target_id, status)
) ENGINE=InnoDB;
