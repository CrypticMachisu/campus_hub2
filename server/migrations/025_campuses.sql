-- Migration: introduce the campus boundary.
--
-- Phase 4 keeps one campus per user and one campus per club for now. Content
-- inherits its campus from the owning club; events, commitments, posts and
-- comments do not need their own campus column. Cross-campus clubs and
-- discovery are deliberately left for the later cross-university phase.
--
-- Registration resolves the campus from the email domain. A campus may own
-- several domains: Strathmore's real domain is strathmore.edu, while the
-- seeded demo accounts use campus.edu so existing logins keep working.
CREATE TABLE campuses (
    campus_id  VARCHAR(30) PRIMARY KEY,
    name       VARCHAR(150) NOT NULL,
    slug       VARCHAR(80) NOT NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE campus_email_domains (
    domain    VARCHAR(190) PRIMARY KEY,
    campus_id VARCHAR(30) NOT NULL,
    CONSTRAINT fk_campus_domain_campus
        FOREIGN KEY (campus_id) REFERENCES campuses(campus_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO campuses (campus_id, name, slug)
VALUES ('campus-01', 'Strathmore University', 'strathmore');

INSERT INTO campus_email_domains (domain, campus_id) VALUES
    ('strathmore.edu', 'campus-01'),
    ('campus.edu', 'campus-01');

ALTER TABLE users
    ADD COLUMN campus_id VARCHAR(30) NULL AFTER role;

ALTER TABLE users
    MODIFY COLUMN role ENUM('tier1', 'campus_admin', 'tier2', 'member')
    NOT NULL DEFAULT 'member';

ALTER TABLE clubs
    ADD COLUMN campus_id VARCHAR(30) NULL AFTER club_id;

-- Every existing demo row belongs to the only campus in the system. If a
-- database already contains rows from another campus, assign those explicitly
-- before running this migration.
UPDATE users SET campus_id = 'campus-01' WHERE campus_id IS NULL;
UPDATE clubs SET campus_id = 'campus-01' WHERE campus_id IS NULL;

ALTER TABLE users
    MODIFY COLUMN campus_id VARCHAR(30) NOT NULL;

ALTER TABLE clubs
    MODIFY COLUMN campus_id VARCHAR(30) NOT NULL;

ALTER TABLE users
    ADD INDEX idx_users_campus (campus_id),
    ADD CONSTRAINT fk_users_campus
        FOREIGN KEY (campus_id) REFERENCES campuses(campus_id)
        ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE clubs
    ADD INDEX idx_clubs_campus (campus_id),
    ADD CONSTRAINT fk_clubs_campus
        FOREIGN KEY (campus_id) REFERENCES campuses(campus_id)
        ON UPDATE CASCADE ON DELETE RESTRICT;
