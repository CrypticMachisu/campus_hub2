-- Migration: per-club playbook overrides
-- Run this AFTER 001–004.
--
--   mysql -u root campushub < server/migrations/005_club_playbook.sql
--
-- The member workspace adapts to a club through a "playbook": which verb its
-- RSVP uses, what to bring, and one focus panel (a motion to prep, a shooting
-- prompt, pace groups...). Categories supply sensible defaults in the frontend
-- (src/utils/clubPlaybook.js); these nullable columns let a club admin override
-- those defaults without a code change. NULL/empty means "use the default".
--
-- Not idempotent (MySQL has no ADD COLUMN IF NOT EXISTS) — running it twice
-- errors on the first duplicate column, which is harmless.


ALTER TABLE clubs
    ADD COLUMN rsvp_label  VARCHAR(40)  NULL,
    ADD COLUMN bring_note  VARCHAR(240) NULL,
    ADD COLUMN focus_title VARCHAR(120) NULL,
    ADD COLUMN focus_body  VARCHAR(500) NULL,
    ADD COLUMN focus_items TEXT         NULL,
    ADD COLUMN focus_link  VARCHAR(300) NULL;
