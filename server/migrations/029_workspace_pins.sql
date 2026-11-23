-- Migration: club-wide pins for the member workspace feed.
--
-- The feed merges two existing sources (announcements and top-level club
-- comments), so a pin cannot live on either table alone without changing both
-- shapes. This table records a pin against the club and the source item.
--
-- `CREATE TABLE IF NOT EXISTS` keeps this safe for a database built from
-- server/campushub_database.sql, which already contains the table.
--
-- Run this AFTER 028:
--
--   DB_NAME=campushub_standalone npm run migrate

CREATE TABLE IF NOT EXISTS workspace_pins (
    pin_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    club_id     VARCHAR(30) NOT NULL,
    item_type   ENUM('announcement', 'comment') NOT NULL,
    item_id     VARCHAR(64) NOT NULL,
    pinned_by   VARCHAR(30) NULL,
    pinned_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_workspace_pin (club_id, item_type, item_id),
    INDEX idx_workspace_pins_club (club_id, pinned_at),
    CONSTRAINT fk_workspace_pins_club
        FOREIGN KEY (club_id) REFERENCES clubs(club_id) ON DELETE CASCADE
) ENGINE=InnoDB;
