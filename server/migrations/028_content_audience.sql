-- Migration: content audience foundation.
--
-- Everything defaults to the owning campus. `network` is an explicit opt-in
-- that can travel to readers whose approved affiliations include a campus in
-- the host family. `public` is reserved for a later verified public directory
-- and is not accepted by the API yet.
ALTER TABLE events
    ADD COLUMN audience ENUM('campus', 'network', 'public') NOT NULL DEFAULT 'campus'
    AFTER capacity;

ALTER TABLE posts
    ADD COLUMN audience ENUM('campus', 'network', 'public') NOT NULL DEFAULT 'campus'
    AFTER status;

ALTER TABLE commitments
    ADD COLUMN audience ENUM('campus', 'network', 'public') NOT NULL DEFAULT 'campus'
    AFTER source;
