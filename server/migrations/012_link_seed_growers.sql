-- Migration: point the seeded activities at real AgroConnect growers
--
--   npm run migrate
--
-- Linking is by name: server/routes/agro.js matches an opportunity's host_name
-- (or farmer_id, when set) against the partner's /farmers list, then shows that
-- grower's current /produce listings on the card. farmer_id is left NULL here
-- because Team 6's numeric ids are not guaranteed across their environments;
-- a name match is enough for a demo and simply does not attach anything once
-- the grower is gone.
--
-- opp-04 stays without a host on purpose: running the market stall is a club
-- shift, not a visit to one farmer.

UPDATE agro_opportunities
   SET host_name = 'Daniel Kamau'
 WHERE opportunity_id = 'agro-opp-01' AND source = 'seed';

UPDATE agro_opportunities
   SET host_name = 'Kemboi Kirui'
 WHERE opportunity_id = 'agro-opp-02' AND source = 'seed';

UPDATE agro_opportunities
   SET host_name = 'Mark Kage'
 WHERE opportunity_id = 'agro-opp-03' AND source = 'seed';
