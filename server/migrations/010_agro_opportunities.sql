-- Migration: AgroConnect opportunities for the Agri-Business & Farming club
-- Run this AFTER 001–009.
--
--   npm run migrate
--
-- Why a table of our own instead of reading the partner live:
-- Team 6's AgroConnect contract has no opportunities resource. It gives us
-- growers and produce, not farm visits. So an opportunity is OUR record — a
-- farm visit, tree-planting day, harvest morning or volunteering shift — and
-- the partner only supplies the grower context beside it (name, county).
--
-- That split is also the fallback story: the opportunity rows are local and
-- always render. If AgroConnect is down, we still have everyone's activities,
-- plus the last farmer list we received in `partner_snapshots` (written on
-- every successful call, so it survives a restart — the in-memory cache in
-- server/routes/partner.js does not).
--
-- `source` records where a row came from: 'seed' (this file) or 'admin'
-- (POST /api/v2/agro/opportunities). farmer_id is Team 6's id when an admin
-- linked a grower; seeds leave it NULL and match by host_name instead.

CREATE TABLE IF NOT EXISTS partner_snapshots (
    cache_key VARCHAR(80) PRIMARY KEY,
    payload   LONGTEXT NOT NULL,
    as_of     DATETIME NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS agro_opportunities (
    opportunity_id VARCHAR(60)  PRIMARY KEY,       -- e.g. 'agro-opp-01' or 'agro-<timestamp>'
    kind           VARCHAR(24)  NOT NULL,          -- farm_visit | tree_planting | harvest | volunteering
    title          VARCHAR(150) NOT NULL,
    description    TEXT,
    location       VARCHAR(150) NOT NULL,
    county         VARCHAR(80)  NULL,
    starts_at      DATETIME     NOT NULL,          -- East Africa Time wall clock, like events
    capacity       INT          NULL,               -- NULL = no stated limit
    host_name      VARCHAR(120) NULL,               -- grower or organiser named on the card
    farmer_id      INT          NULL,               -- Team 6 grower id, when one is linked
    source         VARCHAR(12)  NOT NULL DEFAULT 'admin',
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_agro_starts (starts_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS agro_interest (
    opportunity_id VARCHAR(60) NOT NULL,
    user_id        VARCHAR(30) NOT NULL,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (opportunity_id, user_id),
    CONSTRAINT fk_agro_interest_opportunity
        FOREIGN KEY (opportunity_id) REFERENCES agro_opportunities(opportunity_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_agro_interest_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

-- Seed activities. Dates are relative to CURDATE() so they stay upcoming
-- whenever the migration is applied, the way the event seeds behave.
INSERT IGNORE INTO agro_opportunities
    (opportunity_id, kind, title, description, location, county, starts_at, capacity, host_name, source)
VALUES
    ('agro-opp-01', 'farm_visit',
     'Farm visit: Grace''s tomato plot',
     'A morning with a grower who sells on AgroConnect. Walk the plot, see how the tomatoes are graded for market, and ask what a fair price looks like from her side of the table.',
     'Kiambu (transport from the Student Union)', 'Kiambu',
     TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 3 DAY), '08:00:00'), 24, 'Grace Wanjiku', 'seed'),

    ('agro-opp-02', 'tree_planting',
     'Tree planting: Ngong river bank',
     'The club''s termly planting day with the county environment office. We plant indigenous seedlings and stake the ones from last term. Wear closed shoes and bring a water bottle.',
     'Ngong river bank, Kajiado', 'Kajiado',
     TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 9 DAY), '07:30:00'), 60, 'Faith Njeri', 'seed'),

    ('agro-opp-03', 'harvest',
     'Harvest morning at Karen greens',
     'Help bring in a leafy-greens crop, then sort and pack it for the Saturday market. No experience needed — the grower walks everyone through the harvesting.',
     'Karen, Nairobi', 'Nairobi',
     TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 14 DAY), '06:30:00'), 30, 'Samuel Otieno', 'seed'),

    ('agro-opp-04', 'volunteering',
     'Market stall volunteering',
     'Run the club''s AgroConnect stall at the Saturday market: set up, talk to buyers, log what sells and what does not. Two-hour shifts, pairs welcome.',
     'City market, Nairobi', 'Nairobi',
     TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 6 DAY), '16:00:00'), 12, NULL, 'seed');
