#!/usr/bin/env bash
# =============================================================================
# Task Tracker — daily backup: PostgreSQL DB dump + uploads volume archive,
# both shipped to S3-compatible object storage (Backblaze B2 or MinIO).
#
# Run this ON THE VPS, either:
#   (a) directly on the host (primary approach — see below), or
#   (b) inside the `backup` sidecar container from docker-compose.backup.yml
#       (uploads are mounted read-only there; see docs/BACKUP-RESTORE.md).
#
#   ./backup.sh                 # normal run
#   ./backup.sh --verbose       # also log a line on success (systemd/cron use this)
#
# Config is entirely via env vars — copy infra/.env.backup.example to
# .env.backup, fill it in, and either `source .env.backup` before running this
# script or point `EnvironmentFile=` / `env_file:` at it (systemd / compose).
#
# Primary approach for the uploads archive: run ON THE VPS HOST, resolve the
# named volume's mountpoint via `docker volume inspect task_tracker_uploads`
# and tar it directly. The alternative (sidecar container with the volume
# bind-mounted read-only at /uploads) is documented in docs/BACKUP-RESTORE.md
# and is auto-detected below via UPLOADS_SOURCE.
# =============================================================================
set -euo pipefail

# --- Config (edit / override via env, see .env.backup.example) --------------
# Database connection. Either set DATABASE_URL (postgresql://user:pass@host:port/db)
# or the individual PG* vars — DATABASE_URL wins if both are set.
DATABASE_URL="${DATABASE_URL:-}"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-tasktracker}"
PGPASSWORD="${PGPASSWORD:-}"
PGDATABASE="${PGDATABASE:-tasktracker}"

# Uploads: name of the Docker named volume holding /app/public/uploads.
UPLOADS_VOLUME="${UPLOADS_VOLUME:-task_tracker_uploads}"
# Where to read the uploads tree from. "docker-volume" (default, primary
# approach) resolves the mountpoint via `docker volume inspect` and requires
# this script to run on the VPS host with docker + root/sudo access. Set to
# a plain path (e.g. /uploads) to read from there instead — this is what the
# sidecar container variant uses (docker-compose.backup.yml mounts the volume
# read-only at /uploads).
UPLOADS_SOURCE="${UPLOADS_SOURCE:-docker-volume}"

# Local scratch space for artifacts before upload (cleaned up automatically).
WORK_DIR="${WORK_DIR:-/tmp/task-tracker-backup}"

# rclone remote config, entirely via env — no on-disk rclone.conf needed.
# RCLONE_REMOTE is the logical remote name used in `rclone` commands below;
# its backend/credentials come from RCLONE_CONFIG_<REMOTE>_* env vars (see
# .env.backup.example for a Backblaze B2 example and a MinIO/S3 example).
RCLONE_REMOTE="${RCLONE_REMOTE:-backup}"
# Bucket (B2) or bucket/prefix (S3/MinIO) that objects land in, e.g. "coastshield-backups".
RCLONE_BUCKET="${RCLONE_BUCKET:-}"
# Key prefix inside the bucket. Final layout: <prefix>/YYYY-MM-DD/{db.sql.gz,uploads.tar.gz}
KEY_PREFIX="${KEY_PREFIX:-backups/tasktracker}"

# Retention: delete remote date-folders older than this many days after a
# successful upload.
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# Failure notifications (both optional — empty var skips that channel).
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
NOTIFY_EMAIL_TO="${NOTIFY_EMAIL_TO:-}"
NOTIFY_EMAIL_FROM="${NOTIFY_EMAIL_FROM:-task-tracker-backup@coastshield.net}"

VERBOSE=0
[ "${1:-}" = "--verbose" ] && VERBOSE=1

# --- Helpers ------------------------------------------------------------------
log()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { [ "$VERBOSE" = "1" ] && printf '\033[1;32m✓ %s\033[0m\n' "$*" || true; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*" >&2; }
err()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; }

DATE_STAMP="$(date -u +%F)"
REMOTE_DIR_TODAY="${RCLONE_REMOTE}:${RCLONE_BUCKET}/${KEY_PREFIX}/${DATE_STAMP}"
RUN_ID="$$-$(date -u +%s)"
ARTIFACT_DIR="${WORK_DIR}/${RUN_ID}"

notify_slack() {
  local message="$1"
  [ -z "$SLACK_WEBHOOK_URL" ] && return 0
  curl -fsS -X POST -H 'Content-Type: application/json' \
    -d "{\"text\": $(printf '%s' "$message" | sed 's/"/\\"/g; s/^/"/; s/$/"/')}" \
    "$SLACK_WEBHOOK_URL" >/dev/null 2>&1 || warn "Slack notification failed to send"
}

notify_email() {
  local subject="$1" body="$2"
  [ -z "$NOTIFY_EMAIL_TO" ] && return 0
  if command -v mail >/dev/null 2>&1; then
    printf '%s\n' "$body" | mail -s "$subject" -r "$NOTIFY_EMAIL_FROM" "$NOTIFY_EMAIL_TO" \
      || warn "Email notification via 'mail' failed to send"
  elif command -v sendmail >/dev/null 2>&1; then
    { printf 'To: %s\nFrom: %s\nSubject: %s\n\n%s\n' \
        "$NOTIFY_EMAIL_TO" "$NOTIFY_EMAIL_FROM" "$subject" "$body"; } | sendmail -t \
      || warn "Email notification via 'sendmail' failed to send"
  else
    warn "NOTIFY_EMAIL_TO is set but neither 'mail' nor 'sendmail' is available on this host"
  fi
}

on_error() {
  local exit_code=$?
  local line=${1:-?}
  local msg="Task-Tracker backup FAILED on $(hostname) at line ${line} (exit ${exit_code}), run ${DATE_STAMP}."
  err "$msg"
  notify_slack ":rotating_light: $msg"
  notify_email "Task-Tracker backup FAILED (${DATE_STAMP})" "$msg

Check logs on the host (journalctl -u task-tracker-backup, or 'docker compose logs backup')."
  rm -rf "$ARTIFACT_DIR" 2>/dev/null || true
  exit "$exit_code"
}
trap 'on_error $LINENO' ERR

# --- 0. Preflight --------------------------------------------------------------
log "Preflight checks"
command -v rclone >/dev/null 2>&1 || { err "rclone not found (apk add rclone / apt install rclone)"; exit 1; }
command -v pg_dump >/dev/null 2>&1 || { err "pg_dump not found (postgresql-client package)"; exit 1; }
command -v gzip >/dev/null 2>&1 || { err "gzip not found"; exit 1; }
command -v tar >/dev/null 2>&1 || { err "tar not found"; exit 1; }
[ -n "$RCLONE_BUCKET" ] || { err "RCLONE_BUCKET is not set"; exit 1; }

mkdir -p "$ARTIFACT_DIR"
ok "Working in $ARTIFACT_DIR"

# --- 1. Dump PostgreSQL --------------------------------------------------------
log "Dumping PostgreSQL database ($PGDATABASE)"
DB_DUMP="${ARTIFACT_DIR}/db.sql.gz"
if [ -n "$DATABASE_URL" ]; then
  pg_dump --format=plain --no-owner --no-privileges "$DATABASE_URL" | gzip -9 > "$DB_DUMP"
else
  PGPASSWORD="$PGPASSWORD" pg_dump \
    --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" \
    --format=plain --no-owner --no-privileges "$PGDATABASE" | gzip -9 > "$DB_DUMP"
fi
[ -s "$DB_DUMP" ] || { err "DB dump is empty: $DB_DUMP"; exit 1; }
ok "DB dump: $DB_DUMP ($(du -h "$DB_DUMP" | cut -f1))"

# --- 2. Archive uploads ---------------------------------------------------------
log "Archiving uploads volume ($UPLOADS_VOLUME)"
UPLOADS_ARCHIVE="${ARTIFACT_DIR}/uploads.tar.gz"

if [ "$UPLOADS_SOURCE" = "docker-volume" ]; then
  command -v docker >/dev/null 2>&1 || { err "docker not found (needed to resolve UPLOADS_SOURCE=docker-volume)"; exit 1; }
  MOUNTPOINT="$(docker volume inspect -f '{{ .Mountpoint }}' "$UPLOADS_VOLUME")"
  [ -n "$MOUNTPOINT" ] && [ -d "$MOUNTPOINT" ] || { err "Could not resolve mountpoint for volume $UPLOADS_VOLUME"; exit 1; }
  # Docker volume mountpoints are usually root-only — run with sudo if needed.
  tar -czf "$UPLOADS_ARCHIVE" -C "$MOUNTPOINT" .
else
  [ -d "$UPLOADS_SOURCE" ] || { err "UPLOADS_SOURCE path not found: $UPLOADS_SOURCE"; exit 1; }
  tar -czf "$UPLOADS_ARCHIVE" -C "$UPLOADS_SOURCE" .
fi
[ -s "$UPLOADS_ARCHIVE" ] || { err "Uploads archive is empty: $UPLOADS_ARCHIVE"; exit 1; }
ok "Uploads archive: $UPLOADS_ARCHIVE ($(du -h "$UPLOADS_ARCHIVE" | cut -f1))"

# --- 3. Upload to object storage -----------------------------------------------
log "Uploading artifacts to ${REMOTE_DIR_TODAY}"
rclone copy "$DB_DUMP" "$REMOTE_DIR_TODAY/" --checksum
rclone copy "$UPLOADS_ARCHIVE" "$REMOTE_DIR_TODAY/" --checksum
ok "Upload complete: ${REMOTE_DIR_TODAY}/db.sql.gz, ${REMOTE_DIR_TODAY}/uploads.tar.gz"

# --- 4. Retention: delete remote date-folders older than RETENTION_DAYS -------
log "Applying retention (older than ${RETENTION_DAYS} days)"
CUTOFF="$(date -u -d "-${RETENTION_DAYS} days" +%F 2>/dev/null || date -u -v-"${RETENTION_DAYS}"d +%F)"
BASE_REMOTE="${RCLONE_REMOTE}:${RCLONE_BUCKET}/${KEY_PREFIX}"
# List date-prefixed subfolders (one level down) and delete any whose date < cutoff.
rclone lsf "$BASE_REMOTE/" --dirs-only 2>/dev/null | sed 's#/$##' | while read -r folder; do
  case "$folder" in
    ????-??-??) : ;;      # looks like a YYYY-MM-DD folder — continue
    *) continue ;;
  esac
  if [[ "$folder" < "$CUTOFF" ]]; then
    log "Deleting expired backup folder: $folder (older than $CUTOFF)"
    rclone purge "${BASE_REMOTE}/${folder}" || warn "Failed to purge ${folder} (will retry next run)"
  fi
done
ok "Retention pass complete"

# --- 5. Cleanup local temp files -----------------------------------------------
rm -rf "$ARTIFACT_DIR"
ok "Local temp files cleaned up ($ARTIFACT_DIR)"

trap - ERR
log "Backup finished successfully for ${DATE_STAMP}"
ok "db.sql.gz + uploads.tar.gz uploaded to ${REMOTE_DIR_TODAY}, retention applied, no notification sent (success)."
