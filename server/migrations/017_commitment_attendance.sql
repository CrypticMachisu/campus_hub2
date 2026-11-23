-- Migration: attendance for commitment signups.
--
-- Check-in is an officer action taken at the door, not a member toggle. Keeping
-- it on the signup row means a roster response already carries the answer and
-- there is no second list to reconcile when a waitlisted person is promoted.
--
-- Run this AFTER 001–016:
--
--   DB_NAME=campushub_standalone npm run migrate

ALTER TABLE commitment_signups
    ADD COLUMN attendance ENUM('unknown', 'attended', 'no_show')
        NOT NULL DEFAULT 'unknown' AFTER reminder_sent_at;
