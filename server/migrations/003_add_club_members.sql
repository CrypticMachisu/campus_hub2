-- Migration: track actual club membership (not just admin rights)
-- Run this AFTER 001 and 002.
--
--   mysql -u root campushub < server/migrations/003_add_club_members.sql
--
-- Until now the only user<->club link was club_admins, so a plain 'member'
-- had no way to "be part of" a club. This junction table is that link and
-- backs the `memberOfClubs` array returned by /api/auth/me and /api/users.
-- Deliberately separate from club_admins: being a member and being a club
-- admin are independent (you can admin a club you never joined).


CREATE TABLE IF NOT EXISTS club_members (
    membership_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id       VARCHAR(30) NOT NULL,
    club_id       VARCHAR(30) NOT NULL,
    joined_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_club_members_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_club_members_club
        FOREIGN KEY (club_id) REFERENCES clubs(club_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    UNIQUE KEY uq_member_club (user_id, club_id),
    INDEX idx_club_members_club (club_id)
) ENGINE=InnoDB;

-- Everyone who already admins a club is implicitly part of it, so seed
-- those rows rather than leaving existing tier 2 admins without a club.
INSERT IGNORE INTO club_members (user_id, club_id)
SELECT user_id, club_id FROM club_admins;
