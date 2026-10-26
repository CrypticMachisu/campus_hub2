-- Migration: create the admin_requests table
-- Run this AFTER importing campushub_database.sql — versions of that file
-- from before 2026-10 stopped at `announcements`, but the API's
-- /api/admin-requests routes (and Dashboard's admin-access requests UI)
-- read and write this table, so without it every admin-requests call
-- returns a 500.
--
--   mysql -u root campushub < server/migrations/003_create_admin_requests.sql
-- or paste it into phpMyAdmin's SQL tab with `campushub` selected.

USE campushub;

CREATE TABLE IF NOT EXISTS admin_requests (
    request_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id    VARCHAR(30) NOT NULL,
    club_id    VARCHAR(30) NOT NULL,
    status     ENUM('pending','approved','denied') NOT NULL DEFAULT 'pending',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_admin_requests_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_admin_requests_club
        FOREIGN KEY (club_id) REFERENCES clubs(club_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;
