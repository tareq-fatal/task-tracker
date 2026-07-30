#!/usr/bin/env bash
# =============================================================================
# Task Tracker — restore PostgreSQL DB + uploads volume from an S3-compatible
# backup created by infra/backup.sh.
#
# DESTRUCTIVE: overwrites the target database and/or the target uploads path.
# Requires an explicit --yes confirmation flag.
#
# Run this ON THE VPS (same env vars as backup.sh — source .env.backup first).
#
#   ./restore.sh --date 2026-07-04 --yes           # restore a specific day
#   ./restore.sh --date latest --yes                # restore the newest available backup
#   ./restore.sh --date latest --yes --db-only      # DB only, skip uploads
#   ./restore.sh --date latest --yes --uploads-only # uploads only, skip DB
#
# Without --yes the script only shows what it WOULD do (dry-run) and exits.
# =============================================================================
set -euo pipefail

# --- Config (same vars as backup.sh, see .env.backup.example) ----------------
DATABASE_URL="${DATABASE_URL:-}"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-tasktracker}"
PGPASSWORD="${PGPASSWORD:-}"
PGDATABASE="${PGDATABASE:-tasktracker}"

UPLOADS_VOLUME="${UPLOADS_VOLUME:-task_tracker_uploads}"
# Same meaning as in backup.sh: "docker-volume" resolves the mountpoint via
# `docker volume inspect`; otherwise treat this as a plain path to untar into.
UPLOADS_SOURCE="${UPLOADS_SOURCE:-docker-volume}"

WORK_DIR="${WORK_DIR:-/tmp/task-tracker-restore}"

RCLONE_REMOTE="${RCLONE_REMOTE:-backup}"
RCLONE_BUCKET="${RCLONE_BUCKET:-}"
KEY_PREFIX="${KEY_PREFIX:-backups/tasktracker}"

log()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*" >&2; }
err()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; }

usage() {
  cat <<'EOF'
Usage: restore.sh --date <YYYY-MM-DD|latest> [--yes] [--db-only|--uploads-only]

  --date <value>    Backup date-folder to restore, or "latest" for the newest.
  --yes             Required to actually perform the (destructive) restore.
                     Without it, the script prints what it would do and exits.
  --db-only         Only restore the database, skip uploads.
  --uploads-only    Only restore uploads, skip the database.
  -h, --help        Show this help.
EOF
}

TARGET_DATE=""
CONFIRM=0
DO_DB=1
DO_UPLOADS=1

while [ $# -gt 0 ]; do
  case "$1" in
    --date) TARGET_DATE="${2:-}"; shift 2 ;;
    --yes) CONFIRM=1; shift ;;
    --db-only) DO_UPLOADS=0; shift ;;
    --uploads-only) DO_DB=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) err "Unknown argument: $1"; usage; exit 1 ;;
  esac
done

[ -n "$TARGET_DATE" ] || { err "--date is required (YYYY-MM-DD or 'latest')"; usage; exit 1; }
command -v rclone >/dev/null 2>&1 || { err "rclone not found"; exit 1; }
[ -n "$RCLONE_BUCKET" ] || { err "RCLONE_BUCKET is not set"; exit 1; }

BASE_REMOTE="${RCLONE_REMOTE}:${RCLONE_BUCKET}/${KEY_PREFIX}"

# --- Resolve "latest" -----------------------------------------------------------
if [ "$TARGET_DATE" = "latest" ]; then
  log "Resolving latest available backup date"
  TARGET_DATE="$(rclone lsf "$BASE_REMOTE/" --dirs-only 2>/dev/null | sed 's#/$##' | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' | sort | tail -n1)"
  [ -n "$TARGET_DATE" ] || { err "No date-folders found under ${BASE_REMOTE}/"; exit 1; }
fi
ok "Target backup date: $TARGET_DATE"

REMOTE_DIR="${BASE_REMOTE}/${TARGET_DATE}"

# --- Verify the requested backup actually exists --------------------------------
log "Checking remote artifacts under ${REMOTE_DIR}/"
REMOTE_LIST="$(rclone lsf "${REMOTE_DIR}/" 2>/dev/null || true)"
[ -n "$REMOTE_LIST" ] || { err "No objects found at ${REMOTE_DIR}/ — wrong date?"; exit 1; }
echo "$REMOTE_LIST" | sed 's/^/  - /'

# --- Describe what will happen, and bail out without --yes ---------------------
log "This restore will OVERWRITE the following if run with --yes:"
[ "$DO_DB" = "1" ] && echo "  - Database '${PGDATABASE}' on host '${PGHOST:-$DATABASE_URL}' — ALL CURRENT DATA IN IT WILL BE LOST"
[ "$DO_UPLOADS" = "1" ] && echo "  - Uploads at ${UPLOADS_SOURCE} (volume: ${UPLOADS_VOLUME}) — existing files will be replaced"

if [ "$CONFIRM" != "1" ]; then
  warn "Dry-run only (no --yes given). Nothing was changed. Re-run with --yes to proceed."
  exit 0
fi

RUN_ID="restore-$$-$(date -u +%s)"
ARTIFACT_DIR="${WORK_DIR}/${RUN_ID}"
mkdir -p "$ARTIFACT_DIR"
cleanup() { rm -rf "$ARTIFACT_DIR" 2>/dev/null || true; }
trap cleanup EXIT

# --- Restore DB ------------------------------------------------------------------
if [ "$DO_DB" = "1" ]; then
  log "Downloading db.sql.gz"
  rclone copy "${REMOTE_DIR}/db.sql.gz" "$ARTIFACT_DIR/" --checksum
  DB_DUMP="${ARTIFACT_DIR}/db.sql.gz"
  [ -s "$DB_DUMP" ] || { err "Downloaded DB dump is missing/empty"; exit 1; }

  log "Restoring into database '${PGDATABASE}' (plain-SQL dump via psql)"
  if [ -n "$DATABASE_URL" ]; then
    gunzip -c "$DB_DUMP" | psql -v ON_ERROR_STOP=1 "$DATABASE_URL"
  else
    gunzip -c "$DB_DUMP" | PGPASSWORD="$PGPASSWORD" psql -v ON_ERROR_STOP=1 \
      --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --dbname="$PGDATABASE"
  fi
  ok "Database restored from ${TARGET_DATE}"
else
  warn "Skipping DB restore (--uploads-only)"
fi

# --- Restore uploads ---------------------------------------------------------------
if [ "$DO_UPLOADS" = "1" ]; then
  log "Downloading uploads.tar.gz"
  rclone copy "${REMOTE_DIR}/uploads.tar.gz" "$ARTIFACT_DIR/" --checksum
  UPLOADS_ARCHIVE="${ARTIFACT_DIR}/uploads.tar.gz"
  [ -s "$UPLOADS_ARCHIVE" ] || { err "Downloaded uploads archive is missing/empty"; exit 1; }

  if [ "$UPLOADS_SOURCE" = "docker-volume" ]; then
    command -v docker >/dev/null 2>&1 || { err "docker not found (needed to resolve UPLOADS_SOURCE=docker-volume)"; exit 1; }
    MOUNTPOINT="$(docker volume inspect -f '{{ .Mountpoint }}' "$UPLOADS_VOLUME")"
    [ -n "$MOUNTPOINT" ] && [ -d "$MOUNTPOINT" ] || { err "Could not resolve mountpoint for volume $UPLOADS_VOLUME"; exit 1; }
    log "Clearing existing contents of $MOUNTPOINT"
    find "$MOUNTPOINT" -mindepth 1 -delete
    log "Extracting uploads.tar.gz into $MOUNTPOINT"
    tar -xzf "$UPLOADS_ARCHIVE" -C "$MOUNTPOINT"
  else
    [ -d "$UPLOADS_SOURCE" ] || mkdir -p "$UPLOADS_SOURCE"
    log "Clearing existing contents of $UPLOADS_SOURCE"
    find "$UPLOADS_SOURCE" -mindepth 1 -delete
    log "Extracting uploads.tar.gz into $UPLOADS_SOURCE"
    tar -xzf "$UPLOADS_ARCHIVE" -C "$UPLOADS_SOURCE"
  fi
  ok "Uploads restored from ${TARGET_DATE}"
else
  warn "Skipping uploads restore (--db-only)"
fi

log "Restore finished for ${TARGET_DATE}. Restart the task-tracker container if it was running:"
echo "  docker compose -f docker-compose.prod.yml restart task-tracker"
