-- Migration: per-event "what to bring" and RSVP capacity
-- Run this AFTER 001–005.
--
--   mysql -u root campushub < server/migrations/006_event_capacity.sql
--
-- bring_note is the per-event version of the club playbook's note (the hero
-- prefers it, then falls back to the club's). capacity turns RSVPs into a
-- capped list: signups past the cap aren't rejected, they're waitlisted in
-- arrival order (see GET /api/signups/mine). NULL capacity = unlimited.
--
-- Not idempotent — re-running errors on the duplicate column, harmlessly.


ALTER TABLE events
    ADD COLUMN bring_note VARCHAR(240) NULL,
    ADD COLUMN capacity   INT          NULL;
