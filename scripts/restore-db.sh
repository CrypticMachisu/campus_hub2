#!/usr/bin/env bash
# Restore a backup created by scripts/backup-db.sh.
#
# Usage:
#   CONFIRM_RESTORE=yes bash scripts/restore-db.sh backups/campushub-....sql.gz
#
# This replaces the tables in the current database. Take a fresh backup first
# if the existing data matters. The confirmation is deliberately explicit so a
# mistyped command cannot wipe a deployment.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-deploy/.env}"
FILE="${1:-}"

if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Usage: CONFIRM_RESTORE=yes bash scripts/restore-db.sh <backup.sql.gz>" >&2
  exit 2
fi
if [[ "${CONFIRM_RESTORE:-}" != "yes" ]]; then
  echo "Refusing to restore without CONFIRM_RESTORE=yes." >&2
  echo "This will replace the current database tables." >&2
  exit 2
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy deploy/.env.example and set the database values." >&2
  exit 1
fi

echo "Restoring $FILE into the Compose database ..."
gzip -dc "$FILE" | docker compose --env-file "$ENV_FILE" exec -T db sh -c \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -u root "$MYSQL_DATABASE"'

echo "Restore complete. Verify /api/ready and run a smoke check."
