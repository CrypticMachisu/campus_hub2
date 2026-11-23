-- Migration: club-family schema foundation.
--
-- A family owns the shared identity of a club with chapters on more than one
-- campus. A chapter is still a normal clubs row: clubs.family_id is nullable so
-- every existing single-campus club is unchanged. The Phase 5 APIs and UI stay
-- behind CROSS_UNIVERSITY_ENABLED and are not created by this migration.
CREATE TABLE club_families (
    family_id      VARCHAR(30) PRIMARY KEY,
    name           VARCHAR(150) NOT NULL,
    slug           VARCHAR(80) NOT NULL UNIQUE,
    description    TEXT NULL,
    logo_url       VARCHAR(500) NULL,
    home_campus_id VARCHAR(30) NOT NULL,
    status         ENUM('active', 'archived') NOT NULL DEFAULT 'active',
    created_by     VARCHAR(30) NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_club_family_home_campus
        FOREIGN KEY (home_campus_id) REFERENCES campuses(campus_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_club_family_creator
        FOREIGN KEY (created_by) REFERENCES users(user_id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    INDEX idx_club_families_status (status, name)
) ENGINE=InnoDB;

ALTER TABLE clubs
    ADD COLUMN family_id VARCHAR(30) NULL AFTER campus_id,
    ADD INDEX idx_clubs_family (family_id),
    ADD UNIQUE KEY uq_club_family_campus (family_id, campus_id),
    ADD CONSTRAINT fk_clubs_family
        FOREIGN KEY (family_id) REFERENCES club_families(family_id)
        ON UPDATE CASCADE ON DELETE SET NULL;

-- Delegated family identity editors are a later surface. The link table is
-- here now so family ownership does not have to be bolted onto users.role.
CREATE TABLE club_family_admins (
    family_id VARCHAR(30) NOT NULL,
    user_id   VARCHAR(30) NOT NULL,
    role      ENUM('lead', 'editor') NOT NULL DEFAULT 'lead',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (family_id, user_id),
    CONSTRAINT fk_family_admin_family
        FOREIGN KEY (family_id) REFERENCES club_families(family_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_family_admin_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;
