#!/usr/bin/env bash
# Back up the Compose MySQL database without stopping it.
#
# Usage:
#   bash scripts/backup-db.sh
#   BACKUP_DIR=/var/backups/kesho RETENTION_DAYS=30 bash scripts/backup-db.sh
#
# Off-host copy (recommended):
#   OFFSITE_REMOTE=remote:kesho/backups bash scripts/backup-db.sh
#
# Failure alerting (recommended):
#   ALERT_WEBHOOK_URL=https://hooks.slack.com/services/... bash scripts/backup-db.sh
#
# The dump is written to backups/, ignored by git, and removed after
# RETENTION_DAYS (default 14). If OFFSITE_REMOTE is set, rclone copies it there
# and deletes remote backups older than OFFSITE_RETENTION_DAYS (default 30).
# If ALERT_WEBHOOK_URL is set, any failure sends a JSON message to that URL.
# Test a restore with scripts/restore-db.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-deploy/.env}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
OFFSITE_REMOTE="${OFFSITE_REMOTE:-}"
OFFSITE_RETENTION_DAYS="${OFFSITE_RETENTION_DAYS:-30}"
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/campushub-$STAMP.sql.gz"
HOST_LABEL="$(hostname 2>/dev/null || echo unknown-host)"

json_escape() {
  printf '%s' "$1" | tr '\n\r\t' '   ' | sed 's/\\/\\\\/g; s/"/\\"/g'
}

send_alert() {
  local message="$1"
  if [[ -z "$ALERT_WEBHOOK_URL" ]]; then
    echo "$message" >&2
    return 0
  fi

  local escaped payload
  escaped="$(json_escape "$message")"
  payload="{\"text\":\"$escaped\",\"content\":\"$escaped\"}"

  if ! curl -fsS --max-time 10 --retry 2 --retry-delay 1 \
    -H 'Content-Type: application/json' \
    --data "$payload" \
    "$ALERT_WEBHOOK_URL" >/dev/null; then
    echo "Could not deliver the backup failure alert." >&2
    echo "$message" >&2
  fi
}

on_error() {
  local status=$?
  local line="$1"
  trap - ERR
  local message="Kesho backup FAILED on $HOST_LABEL at $(date -u +%Y-%m-%dT%H:%M:%SZ) (line $line, exit $status)."
  send_alert "$message" || true
  exit "$status"
}
trap 'on_error $LINENO' ERR

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy deploy/.env.example and set the database values." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TMP="$OUT.part"
trap 'rm -f "$TMP"' EXIT

echo "Backing up the database to $OUT ..."
docker compose --env-file "$ENV_FILE" exec -T db sh -c \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -u root --single-transaction --quick --routines --triggers "$MYSQL_DATABASE"' \
  | gzip -9 >"$TMP"

if [[ ! -s "$TMP" ]]; then
  echo "Backup is empty; leaving the previous backup in place." >&2
  false
fi

mv "$TMP" "$OUT"
chmod 600 "$OUT"

# Keep only recent local backups. This runs after the new file is safely written.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'campushub-*.sql.gz' -mtime "+$RETENTION_DAYS" -print -delete

if [[ -n "$OFFSITE_REMOTE" ]]; then
  if ! command -v rclone >/dev/null 2>&1; then
    echo "OFFSITE_REMOTE is set but rclone is not installed." >&2
    echo "Install rclone and configure the remote, or unset OFFSITE_REMOTE." >&2
    false
  fi

  echo "Copying $OUT to $OFFSITE_REMOTE ..."
  rclone copyto "$OUT" "$OFFSITE_REMOTE/$(basename "$OUT")"

  if ! rclone lsf "$OFFSITE_REMOTE" --files-only --include "$(basename "$OUT")" \
    | grep -Fqx "$(basename "$OUT")"; then
    echo "Off-host copy could not be verified at $OFFSITE_REMOTE." >&2
    false
  fi

  echo "Removing off-host backups older than ${OFFSITE_RETENTION_DAYS} days ..."
  rclone delete "$OFFSITE_REMOTE" --include 'campushub-*.sql.gz' \
    --min-age "${OFFSITE_RETENTION_DAYS}d"
  echo "Off-host copy verified: $OFFSITE_REMOTE/$(basename "$OUT")"
fi

echo "Backup complete: $OUT"
