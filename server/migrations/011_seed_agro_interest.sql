-- Migration: seed a few interest registrations for the Agri club.
--
--   npm run migrate
--
-- The opportunities panel is member-only, so a fresh database opens with
-- "0 members are interested" everywhere and the admin's interest roster looks
-- broken even when it works. These three rows give the demo believable counts
-- without inventing anything about the partner: they are registrations by the
-- seed accounts that already belong to club-07.
--
-- INSERT ... SELECT (not hard-coded user ids) so the rows follow the seed
-- accounts if their ids differ, and INSERT IGNORE so re-running is harmless.

INSERT IGNORE INTO agro_interest (opportunity_id, user_id)
SELECT 'agro-opp-01', user_id FROM users
WHERE email IN ('sofia.ramirez@campus.edu', 'blujohn01@campus.edu');

INSERT IGNORE INTO agro_interest (opportunity_id, user_id)
SELECT 'agro-opp-02', user_id FROM users
WHERE email = 'sofia.ramirez@campus.edu';

INSERT IGNORE INTO agro_interest (opportunity_id, user_id)
SELECT 'agro-opp-04', user_id FROM users
WHERE email = 'blujohn01@campus.edu';
