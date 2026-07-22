#!/usr/bin/env bash
# =============================================================================
# Task Tracker — backup.
#
#   sudo ./backup.sh                      # backup to /var/backups/task-tracker
#   sudo ./backup.sh --to /media/usb      # backup onto a USB stick instead
#   sudo ./backup.sh --keep 30            # keep the last 30 backups
#   sudo ./backup.sh --quiet              # no output unless something fails
#
# One backup is one self-contained folder <target>/YYYYMMDD-HHMMSS/ holding:
#   db.sql.gz        the complete database
#   uploads.tar.gz   attachments and voice notes
#   caddy.tar.gz     the HTTPS certificates (avoids re-issuing after a restore)
#   config.env       the configuration, INCLUDING ALL PASSWORDS
#   MANIFEST.txt     what is in here and how to restore it
#
# Because config.env contains the secrets, every backup folder is chmod 700.
# Treat a backup like the password itself — anyone who has it has the data.
#
# Runs while the app keeps serving: pg_dump takes a consistent snapshot.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

KEEP=14
QUIET=0
TARGET=""

usage() {
  cat <<'EOF'
Usage: sudo ./backup.sh [options]

  --to <path>     Where to write the backup.  [default: /var/backups/task-tracker]
  --keep <n>      How many backups to keep in that folder.        [default: 14]
  --quiet         Only print something if the backup fails.
  -h, --help      Show this help.
EOF
}

ORIG_ARGS=("$@")
while [ $# -gt 0 ]; do
  case "$1" in
    --to) TARGET="${2:-}"; shift 2 ;;
    --keep) KEEP="${2:-14}"; shift 2 ;;
    --quiet|-q) QUIET=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) err "Unknown option: $1"; usage; exit 1 ;;
  esac
done

require_root ${ORIG_ARGS[@]+"${ORIG_ARGS[@]}"}
require_installed

[ -n "$TARGET" ] && TT_BACKUP_DIR="$TARGET"
if [ "$QUIET" = "1" ]; then
  step() { :; }; ok() { :; }; info() { :; }
fi

STAMP="$(timestamp)"
DEST="$TT_BACKUP_DIR/$STAMP"
PROJECT="task-tracker"

PG_USER="$(env_get POSTGRES_USER)"; PG_USER="${PG_USER:-tasktracker}"
PG_DB="$(env_get POSTGRES_DB)";     PG_DB="${PG_DB:-tasktracker}"

# The image is guaranteed to be on this machine (the stack runs it), so use it
# for the volume archiving too instead of pulling a separate helper image.
HELPER_IMAGE="postgres:16-alpine"

cleanup_failed() {
  local code=$?
  if [ "$code" != "0" ]; then
    err "Backup FAILED (exit $code). Removing the incomplete folder $DEST"
    rm -rf "$DEST"
  fi
}
trap cleanup_failed EXIT

step "Backing up to $DEST"
mkdir -p "$DEST"
chmod 700 "$DEST"

# --- 1. Database --------------------------------------------------------------
info "Dumping the database…"
dc exec -T postgres pg_dump -U "$PG_USER" --no-owner --no-privileges "$PG_DB" \
  | gzip -9 >"$DEST/db.sql.gz"
[ -s "$DEST/db.sql.gz" ] || die "The database dump is empty — is the postgres container running?"
ok "Database: $(du -h "$DEST/db.sql.gz" | cut -f1)"

# --- 2. Volumes ---------------------------------------------------------------
archive_volume() {
  local volume="$1" outfile="$2" label="$3"
  if ! docker volume inspect "$volume" >/dev/null 2>&1; then
    info "No $label volume yet — skipping."
    return 0
  fi
  docker run --rm \
    -v "$volume":/src:ro \
    -v "$DEST":/backup \
    "$HELPER_IMAGE" \
    tar czf "/backup/$outfile" -C /src . 2>/dev/null
  ok "$label: $(du -h "$DEST/$outfile" | cut -f1)"
}

info "Archiving uploads…"
archive_volume "${PROJECT}_uploads" "uploads.tar.gz" "Uploads"
info "Archiving certificates…"
archive_volume "${PROJECT}_caddy_data" "caddy.tar.gz" "Certificates"

# --- 3. Configuration ----------------------------------------------------------
cp "$TT_INSTALL_DIR/.env" "$DEST/config.env"
[ -f "$TT_INSTALL_DIR/Caddyfile" ] && cp "$TT_INSTALL_DIR/Caddyfile" "$DEST/Caddyfile"
chmod 600 "$DEST"/config.env
ok "Configuration saved"

# --- 4. Manifest ---------------------------------------------------------------
cat >"$DEST/MANIFEST.txt" <<EOF
Task Tracker backup
===================
Created : $(date -u '+%Y-%m-%d %H:%M:%S UTC')
Host    : $(hostname)
Version : $(env_get TT_VERSION || echo unknown)
Domain  : $(env_get TT_DOMAIN || echo '(LAN install)')

Contents
--------
db.sql.gz       PostgreSQL dump (database "$PG_DB", user "$PG_USER")
uploads.tar.gz  /app/public/uploads — attachments and voice notes
caddy.tar.gz    Caddy /data — HTTPS certificates
config.env      .env at the time of the backup — CONTAINS ALL PASSWORDS
Caddyfile       web-server configuration

Restore
-------
  sudo /opt/task-tracker/restore.sh --from $DEST --yes

WARNING: this folder contains the passwords of the installation in clear text.
Store it exactly as securely as you would store the passwords themselves.
EOF
chmod 600 "$DEST/MANIFEST.txt"

# --- 5. Retention ---------------------------------------------------------------
if [ "$KEEP" -gt 0 ]; then
  mapfile -t ALL < <(find "$TT_BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*-*' | sort)
  local_count="${#ALL[@]}"
  if [ "$local_count" -gt "$KEEP" ]; then
    for old in "${ALL[@]:0:$((local_count - KEEP))}"; do
      info "Deleting the expired backup $(basename "$old")"
      rm -rf "$old"
    done
  fi
fi

trap - EXIT
SIZE="$(du -sh "$DEST" | cut -f1)"
if [ "$QUIET" = "1" ]; then
  exit 0
fi
ok "Backup complete: $DEST ($SIZE)"
info "Copy it onto a USB stick or another machine — a backup on the same"
info "server does not survive that server being lost."
