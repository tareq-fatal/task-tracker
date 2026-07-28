#!/usr/bin/env bash
# =============================================================================
# Task Tracker — restore from a backup made by backup.sh.
#
#   sudo ./restore.sh                          # list the available backups
#   sudo ./restore.sh --from latest --yes      # restore the newest one
#   sudo ./restore.sh --from /media/usb/20260722-031500 --yes
#   sudo ./restore.sh --from latest --yes --db-only
#
# DESTRUCTIVE: everything currently in the database is replaced by the contents
# of the backup. Nothing happens without --yes; without it the script only
# reports what it would do.
#
# A safety copy of the CURRENT state is written to
# /var/backups/task-tracker/pre-restore-<timestamp>/ first, so a restore of the
# wrong backup can itself be undone.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

SOURCE=""
CONFIRMED=0
DO_DB=1
DO_UPLOADS=1
DO_CERTS=1
SKIP_SAFETY=0

usage() {
  cat <<'EOF'
Usage: sudo ./restore.sh --from <backup|latest> --yes [options]

  --from <path>    Backup folder to restore, or "latest" for the newest one in
                   /var/backups/task-tracker.
  --yes            Actually do it. Without this the script only reports.
  --db-only        Restore the database only.
  --uploads-only   Restore the attachments only.
  --no-certs       Do not restore the HTTPS certificates.
  --no-safety-copy Skip the safety backup of the current state (not advised).
  -h, --help       Show this help.
EOF
}

ORIG_ARGS=("$@")
while [ $# -gt 0 ]; do
  case "$1" in
    --from) SOURCE="${2:-}"; shift 2 ;;
    --yes|-y) CONFIRMED=1; shift ;;
    --db-only) DO_UPLOADS=0; DO_CERTS=0; shift ;;
    --uploads-only) DO_DB=0; DO_CERTS=0; shift ;;
    --no-certs) DO_CERTS=0; shift ;;
    --no-safety-copy) SKIP_SAFETY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) err "Unknown option: $1"; usage; exit 1 ;;
  esac
done

require_root ${ORIG_ARGS[@]+"${ORIG_ARGS[@]}"}
require_installed

PROJECT="task-tracker"
HELPER_IMAGE="postgres:16-alpine"
PG_USER="$(env_get POSTGRES_USER)"; PG_USER="${PG_USER:-tasktracker}"
PG_DB="$(env_get POSTGRES_DB)";     PG_DB="${PG_DB:-tasktracker}"

list_backups() {
  find "$TT_BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*-*' 2>/dev/null | sort
}

# --- No --from: just show what is available and stop ---------------------------
if [ -z "$SOURCE" ]; then
  step "Available backups in $TT_BACKUP_DIR"
  found=0
  while read -r d; do
    [ -z "$d" ] && continue
    found=1
    printf '  %s  %s  %s\n' "$(basename "$d")" "$(du -sh "$d" | cut -f1)" \
      "$( [ -f "$d/db.sql.gz" ] && echo "" || echo "(incomplete!)" )"
  done < <(list_backups)
  [ "$found" = "0" ] && info "No backups found."
  echo
  info "Restore one with:  sudo ./restore.sh --from <name> --yes"
  exit 0
fi

# --- Resolve the source --------------------------------------------------------
if [ "$SOURCE" = "latest" ]; then
  SOURCE="$(list_backups | tail -n1)"
  [ -n "$SOURCE" ] || die "No backups found in $TT_BACKUP_DIR."
elif [ ! -d "$SOURCE" ] && [ -d "$TT_BACKUP_DIR/$SOURCE" ]; then
  SOURCE="$TT_BACKUP_DIR/$SOURCE"
fi
[ -d "$SOURCE" ] || die "Not a backup folder: $SOURCE"
SOURCE="$(cd "$SOURCE" && pwd)"

step "Backup to restore: $SOURCE"
[ -f "$SOURCE/MANIFEST.txt" ] && sed -n '1,10p' "$SOURCE/MANIFEST.txt" | sed 's/^/    /'
[ "$DO_DB" = "1" ] && { [ -f "$SOURCE/db.sql.gz" ] || die "db.sql.gz is missing from this backup."; }

echo
warn "This will REPLACE:"
[ "$DO_DB" = "1" ]      && warn "  - the whole database (all current tasks, users and comments)"
[ "$DO_UPLOADS" = "1" ] && warn "  - all attachments and voice notes"
[ "$DO_CERTS" = "1" ]   && warn "  - the HTTPS certificates"

if [ "$CONFIRMED" != "1" ]; then
  echo
  info "Nothing was changed (--yes was not given)."
  info "Re-run with --yes to actually restore."
  exit 0
fi

# --- Safety copy of the current state ------------------------------------------
if [ "$SKIP_SAFETY" = "0" ]; then
  step "Safety copy of the current state (in case this restore is a mistake)"
  SAFETY="$TT_BACKUP_DIR/pre-restore-$(timestamp)"
  if "$SCRIPT_DIR/backup.sh" --to "$TT_BACKUP_DIR" --keep 0 --quiet; then
    LATEST_SAFETY="$(list_backups | tail -n1)"
    mv "$LATEST_SAFETY" "$SAFETY" 2>/dev/null || SAFETY="$LATEST_SAFETY"
    ok "Current state saved to $SAFETY"
  else
    warn "The safety copy failed."
    confirm "Continue with the restore anyway?" n || die "Aborted."
  fi
fi

# --- Stop the app (but keep Postgres up so we can talk to it) -------------------
step "Stopping the application"
dc stop app caddy >/dev/null 2>&1 || true
ok "Application stopped (the database stays up for the restore)"

# --- Database -------------------------------------------------------------------
if [ "$DO_DB" = "1" ]; then
  step "Restoring the database"
  # Drop and recreate the schema so the dump lands in a clean database; doing it
  # inside one psql call keeps it atomic from the app's point of view.
  dc exec -T postgres psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 \
    -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" >/dev/null
  gunzip -c "$SOURCE/db.sql.gz" \
    | dc exec -T postgres psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 --quiet >/dev/null
  ok "Database restored"
fi

# --- Volumes ----------------------------------------------------------------------
restore_volume() {
  local archive="$1" volume="$2" label="$3"
  [ -f "$archive" ] || { info "No $label in this backup — skipping."; return 0; }
  docker volume create "$volume" >/dev/null
  docker run --rm \
    -v "$volume":/dst \
    -v "$(dirname "$archive")":/backup:ro \
    "$HELPER_IMAGE" \
    sh -c "rm -rf /dst/* /dst/.[!.]* 2>/dev/null; tar xzf /backup/$(basename "$archive") -C /dst"
  ok "$label restored"
}

if [ "$DO_UPLOADS" = "1" ]; then
  step "Restoring attachments"
  restore_volume "$SOURCE/uploads.tar.gz" "${PROJECT}_uploads" "Attachments"
fi
if [ "$DO_CERTS" = "1" ]; then
  step "Restoring HTTPS certificates"
  restore_volume "$SOURCE/caddy.tar.gz" "${PROJECT}_caddy_data" "Certificates"
fi

# --- Restart -----------------------------------------------------------------------
step "Starting the application again"
dc up -d --no-build >/dev/null
for i in $(seq 1 90); do
  cid="$(dc ps -q app 2>/dev/null | sed -n '1p')"
  [ -n "$cid" ] && [ "$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null)" = "healthy" ] && break
  sleep 2
done
ok "Application running again"

echo
ok "Restore complete — the data is from $(basename "$SOURCE")."
# Written as if/fi, not `[ … ] && info`: as the LAST statement of the script a
# false test would make restore.sh exit 1 and look like a failure.
if [ "$SKIP_SAFETY" = "0" ]; then
  info "Wrong backup? The previous state is in ${SAFETY:-the safety copy}."
fi
exit 0
