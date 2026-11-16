-- Migration: allow comments on commitments.
--
-- comments.target_type was an ENUM('event', 'club') from when those were the
-- only two discussion surfaces. Commitments are now a third, and MySQL will
-- reject the insert until the enum says so. Widening an ENUM keeps every
-- existing row unchanged.
--
-- Run after 013:
--
--   DB_NAME=campushub_standalone npm run migrate

ALTER TABLE comments
    MODIFY COLUMN target_type ENUM('event', 'club', 'commitment') NOT NULL;
