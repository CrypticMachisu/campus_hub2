-- Migration: campus affiliations.
--
-- Phase 4 keeps one home campus on users.campus_id. Phase 5 lets a member ask
-- to belong to additional campuses, but only a campus admin (for that campus)
-- or tier 1 can approve the request. The home campus remains authoritative for
-- identity and the default discovery scope.
CREATE TABLE user_campus_affiliations (
    affiliation_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id         VARCHAR(30) NOT NULL,
    campus_id       VARCHAR(30) NOT NULL,
    kind            ENUM('home', 'exchange', 'dual', 'staff', 'alumni', 'other')
                    NOT NULL DEFAULT 'other',
    status          ENUM('pending', 'active', 'denied', 'revoked')
                    NOT NULL DEFAULT 'pending',
    note            VARCHAR(500) NULL,
    requested_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at      DATETIME NULL,
    decided_by      VARCHAR(30) NULL,
    CONSTRAINT fk_affiliation_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_affiliation_campus
        FOREIGN KEY (campus_id) REFERENCES campuses(campus_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_affiliation_decider
        FOREIGN KEY (decided_by) REFERENCES users(user_id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    UNIQUE KEY uq_user_campus_affiliation (user_id, campus_id),
    INDEX idx_affiliation_campus_status (campus_id, status, requested_at)
) ENGINE=InnoDB;

-- Backfill the home campus for every existing account. A home affiliation is
-- active from the start; it is not an approval request.
INSERT INTO user_campus_affiliations
    (user_id, campus_id, kind, status, requested_at, decided_at)
SELECT user_id, campus_id, 'home', 'active', created_at, created_at
FROM users;
