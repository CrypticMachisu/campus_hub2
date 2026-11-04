-- ----------------------------------------------------------------------------
-- harvest_watch
-- Members of the Agri club pin producer listings from AgroConnect so they
-- keep the details (seller, county, price, arrival date) even after the
-- partner rotates its market feed. Partner data is read-only from our side,
-- so the listing fields are snapshotted here rather than referenced.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS harvest_watch (
    watch_id        VARCHAR(30)  PRIMARY KEY,       -- e.g. 'watch-<timestamp>-<n>'
    user_id         VARCHAR(30)  NOT NULL,
    listing_id      VARCHAR(64)  NOT NULL,          -- partner's produce id
    title           VARCHAR(150) NOT NULL,
    seller          VARCHAR(150),
    county          VARCHAR(100),
    price           DECIMAL(10,2),
    unit            VARCHAR(30),
    quantity        INT,
    available_from  DATETIME     NULL,              -- partner's "YYYY-MM-DD HH:MM:SS"
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_harvest_watch_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    UNIQUE KEY uniq_harvest_watch_user_listing (user_id, listing_id),  -- one pin per listing per member
    INDEX idx_harvest_watch_user (user_id, created_at)                 -- supports the newest-first list
) ENGINE=InnoDB;
