-- Migration: add real password authentication
-- Run this AFTER importing campushub_database.sql.
--
-- Your schema's own comment on `users` explains why this wasn't there:
-- the original app's "login" was just picking a name from a list, no
-- credential check. Since we're adding real login, users needs
-- somewhere to store a bcrypt hash.
--
--   mysql -u root campushub < server/migrations/001_add_password_auth.sql
-- or paste it into phpMyAdmin's SQL tab with `campushub` selected.

USE campushub;

ALTER TABLE users
  ADD COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT '' AFTER email;

-- Every existing seed user now has password_hash = '' , which can never
-- match a bcrypt comparison, so they can't log in yet. Run
-- `npm run set-passwords` (server/set-passwords.js) next to hash and
-- assign a real password to each of them.
