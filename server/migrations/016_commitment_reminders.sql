-- Migration: remember which commitment signups have had their reminder email.
--
-- The reminder worker looks for people going to a commitment that starts inside
-- the reminder window and has no reminder_sent_at yet. Marking the row (instead
-- of a separate jobs table) means a restart, a slow sweep or two runs cannot
-- email the same person twice for the same commitment.
--
-- Run this AFTER 001–015:
--
--   DB_NAME=campushub_standalone npm run migrate

ALTER TABLE commitment_signups
    ADD COLUMN reminder_sent_at DATETIME NULL AFTER created_at;
