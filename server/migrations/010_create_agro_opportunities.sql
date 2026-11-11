-- Migration 010: AgroConnect Opportunities
-- Stores agricultural activities and student registrations.

CREATE TABLE IF NOT EXISTS agro_opportunities (
    opportunity_id VARCHAR(30) NOT NULL,
    club_id VARCHAR(30) NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    activity_type VARCHAR(50) NOT NULL,
    location VARCHAR(150) NOT NULL,
    event_date DATE NOT NULL,
    event_time TIME NULL,
    capacity INT NULL,
    status ENUM('open', 'closed', 'cancelled') NOT NULL DEFAULT 'open',
    created_by VARCHAR(30) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (opportunity_id),
    KEY idx_agro_opportunities_club (club_id),
    KEY idx_agro_opportunities_date (event_date),
    KEY idx_agro_opportunities_creator (created_by),

    CONSTRAINT fk_agro_opportunities_club
        FOREIGN KEY (club_id)
        REFERENCES clubs (club_id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT fk_agro_opportunities_creator
        FOREIGN KEY (created_by)
        REFERENCES users (user_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS agro_opportunity_signups (
    signup_id VARCHAR(30) NOT NULL,
    opportunity_id VARCHAR(30) NOT NULL,
    user_id VARCHAR(30) NOT NULL,
    name_snapshot VARCHAR(100) NOT NULL,
    email_snapshot VARCHAR(150) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (signup_id),
    UNIQUE KEY uq_agro_opportunity_user (opportunity_id, user_id),
    KEY idx_agro_signup_user (user_id),

    CONSTRAINT fk_agro_signup_opportunity
        FOREIGN KEY (opportunity_id)
        REFERENCES agro_opportunities (opportunity_id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT fk_agro_signup_user
        FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;