CREATE TABLE IF NOT EXISTS audit_log (
  audit_id    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id    VARCHAR(30)  NULL,
  actor_name  VARCHAR(100) NULL,
  action      VARCHAR(60)  NOT NULL,
  target_type VARCHAR(20)  NOT NULL,
  target_id   VARCHAR(60)  NULL,
  detail      TEXT         NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB;
