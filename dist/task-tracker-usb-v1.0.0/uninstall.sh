#!/usr/bin/env bash
# =============================================================================
# Task Tracker — uninstall.
#
#   sudo ./uninstall.sh              # remove the app, KEEP the data
#   sudo ./uninstall.sh --purge      # remove everything, including the data
#
# Without --purge the database, the attachments and the certificates stay in
# their Docker volumes: re-running install.sh later picks them straight back up.
#
# --purge is irreversible. It offers to write a final backup first, and asks for
# a typed confirmation.
#
# Docker itself is never removed — other things on this machine may depend on it.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

PURGE=0
FINAL_BACKUP=1

usage() {
  cat <<'EOF'
Usage: sudo ./uninstall.sh [options]

  --purge        Also delete the database, the attachments and the
                 configuration. IRREVERSIBLE.
  --no-backup    Do not offer a final backup before purging.
  -h, --help     Show this help.
EOF
}

ORIG_ARGS=("$@")
while [ $# -gt 0 ]; do
  case "$1" in
    --purge) PURGE=1; shift ;;
    --no-backup) FINAL_BACKUP=0; shift ;;
    --yes|-y) TT_ASSUME_YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) err "Unknown option: $1"; usage; exit 1 ;;
  esac
done

require_root ${ORIG_ARGS[@]+"${ORIG_ARGS[@]}"}

[ -d "$TT_INSTALL_DIR" ] || die "Nothing installed in $TT_INSTALL_DIR."
resolve_compose || die "Docker Compose is not available — cannot stop the containers."

PROJECT="task-tracker"

# =============================================================================
# Confirmation
# =============================================================================
if [ "$PURGE" = "1" ]; then
  printf '\n%s' "$C_RED"
  cat <<'EOF'
  ┌──────────────────────────────────────────────────────────┐
  │  WARNING — this deletes ALL Task Tracker data for good.  │
  │  Tasks, users, comments, attachments: everything.        │
  └──────────────────────────────────────────────────────────┘
EOF
  printf '%s\n' "$C_RESET"

  if [ "$FINAL_BACKUP" = "1" ] && [ -f "$TT_INSTALL_DIR/.env" ]; then
    if confirm "Write one final backup first? (strongly recommended)" y; then
      "$SCRIPT_DIR/backup.sh" --keep 0 || warn "The final backup failed."
    fi
  fi

  if [ "$TT_ASSUME_YES" != "1" ]; then
    printf '%sType %sDELETE%s to confirm: %s' "$C_BOLD" "$C_RED" "$C_RESET$C_BOLD" "$C_RESET"
    read -r typed </dev/tty || typed=""
    [ "$typed" = "DELETE" ] || die "Not confirmed — nothing was deleted."
  fi
else
  step "Removing Task Tracker (the data will be kept)"
  confirm "Continue?" y || die "Aborted."
fi

# =============================================================================
# Stop
# =============================================================================
step "Stopping the containers"
if [ -f "$TT_INSTALL_DIR/docker-compose.yml" ]; then
  dc down --remove-orphans >/dev/null 2>&1 || true
fi
ok "Containers stopped and removed"

# =============================================================================
# Nightly backup timer
# =============================================================================
if command -v systemctl >/dev/null 2>&1; then
  # Captured, then matched in the shell — `| grep -q` fails with 141 under
  # pipefail precisely when it finds something.
  UNIT_FILES="$(systemctl list-unit-files 2>/dev/null || true)"
  if [ "$UNIT_FILES" != "${UNIT_FILES#*task-tracker-backup.timer}" ]; then
    step "Removing the nightly backup timer"
    systemctl disable --now task-tracker-backup.timer >/dev/null 2>&1 || true
    rm -f /etc/systemd/system/task-tracker-backup.timer /etc/systemd/system/task-tracker-backup.service
    systemctl daemon-reload >/dev/null 2>&1 || true
    ok "Timer removed"
  fi
fi

# =============================================================================
# Images
# =============================================================================
step "Removing the application images"
TT_IMAGES="$(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null || true)"
for img in $TT_IMAGES; do
  case "$img" in task-tracker:*) docker rmi "$img" >/dev/null 2>&1 || true ;; esac
done
ok "Images removed"
info "PostgreSQL and Caddy are left in place — other stacks may use them."

# =============================================================================
# Data
# =============================================================================
if [ "$PURGE" = "1" ]; then
  step "Deleting the data"
  for vol in "${PROJECT}_pg_data" "${PROJECT}_uploads" "${PROJECT}_caddy_data" "${PROJECT}_caddy_config"; do
    if docker volume inspect "$vol" >/dev/null 2>&1; then
      docker volume rm "$vol" >/dev/null 2>&1 && ok "Volume $vol deleted" \
        || warn "Could not delete the volume $vol (still in use?)"
    fi
  done
  rm -rf "$TT_INSTALL_DIR"
  ok "$TT_INSTALL_DIR deleted"
  echo
  ok "Task Tracker has been removed completely."
  if [ -d "$TT_BACKUP_DIR" ]; then
    info "The backups in $TT_BACKUP_DIR were NOT touched."
    info "Delete them too with:  sudo rm -rf $TT_BACKUP_DIR"
  fi
else
  echo
  ok "Task Tracker has been stopped and removed."
  info "Your data is still in the Docker volumes:"
  info "  ${PROJECT}_pg_data, ${PROJECT}_uploads, ${PROJECT}_caddy_data"
  info "The configuration is still at $TT_INSTALL_DIR/.env."
  info "Running install.sh again picks everything back up."
  info "To delete the data as well:  sudo ./uninstall.sh --purge"
fi
