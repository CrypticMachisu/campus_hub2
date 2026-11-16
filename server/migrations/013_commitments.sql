-- Migration: commitments — a dated activity a member can actually commit to.
--
-- Replaces the Agri-only "opportunities" idea with a club-scoped model every
-- club can use. A commitment has a host, a place, a time and an optional
-- capacity; signups past capacity are waitlisted in arrival order, computed
-- from created_at, exactly like event RSVPs.
--
-- The old agro_* tables are left in place (nothing is dropped), and their rows
-- are copied here so the club's existing activities and interest survive the
-- switch. The API and UI move to commitments; the agro routes are retired.
--
-- Run this AFTER 001–012:
--
--   DB_NAME=campushub_standalone npm run migrate

CREATE TABLE IF NOT EXISTS commitments (
    commitment_id VARCHAR(60)  PRIMARY KEY,      -- e.g. 'commit-<timestamp>'
    club_id       VARCHAR(30)  NOT NULL,
    kind          VARCHAR(24)  NOT NULL DEFAULT 'activity',
    title         VARCHAR(150) NOT NULL,
    description   TEXT,
    location      VARCHAR(150) NOT NULL,
    county        VARCHAR(80)  NULL,
    starts_at     DATETIME     NOT NULL,          -- East Africa Time wall clock
    capacity      INT          NULL,              -- NULL = no stated limit
    host_name     VARCHAR(120) NULL,
    source        VARCHAR(12)  NOT NULL DEFAULT 'admin', -- seed | admin
    created_by    VARCHAR(30)  NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_commitments_club_start (club_id, starts_at),
    CONSTRAINT fk_commitments_club
        FOREIGN KEY (club_id) REFERENCES clubs(club_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_commitments_creator
        FOREIGN KEY (created_by) REFERENCES users(user_id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS commitment_signups (
    signup_id        VARCHAR(80)  PRIMARY KEY,
    commitment_id    VARCHAR(60)  NOT NULL,
    user_id          VARCHAR(30)  NOT NULL,
    name_snapshot    VARCHAR(120) NOT NULL,
    email_snapshot   VARCHAR(160) NOT NULL,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_commitment_user (commitment_id, user_id),
    INDEX idx_commitment_signups_order (commitment_id, created_at, signup_id),
    CONSTRAINT fk_commitment_signups_commitment
        FOREIGN KEY (commitment_id) REFERENCES commitments(commitment_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_commitment_signups_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

-- Carry the Agri club's existing activities across, keeping their ids so any
-- link already shared keeps resolving.
INSERT IGNORE INTO commitments
    (commitment_id, club_id, kind, title, description, location, county,
     starts_at, capacity, host_name, source, created_at)
SELECT
    o.opportunity_id, 'club-07', o.kind, o.title, o.description, o.location,
    o.county, o.starts_at, o.capacity, o.host_name, o.source, o.created_at
FROM agro_opportunities o;

-- Interest becomes a real signup. Every copied row keeps its original time,
-- which is what decides who is going and who is waitlisted when capacity is
-- smaller than the list.
INSERT IGNORE INTO commitment_signups
    (signup_id, commitment_id, user_id, name_snapshot, email_snapshot, created_at)
SELECT
    CONCAT('cs-', i.opportunity_id, '-', i.user_id),
    i.opportunity_id, i.user_id, u.name, u.email, i.created_at
FROM agro_interest i
JOIN users u ON u.user_id = i.user_id;
