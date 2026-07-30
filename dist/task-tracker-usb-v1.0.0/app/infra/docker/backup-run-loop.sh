#!/usr/bin/env bash
# =============================================================================
# Task Tracker — trivial daily scheduler for the backup sidecar container.
#
# No cron daemon inside the container: just sleep until the next occurrence
# of BACKUP_TIME (HH:MM, container clock/UTC) and run backup.sh, forever.
# Mounted into the `backup` service by docker-compose.backup.yml.
# =============================================================================
set -euo pipefail

BACKUP_TIME="${BACKUP_TIME:-03:30}"

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

seconds_until_next_run() {
  local target_epoch now_epoch
  now_epoch="$(date -u +%s)"
  target_epoch="$(date -u -d "today ${BACKUP_TIME}" +%s 2>/dev/null || true)"
  if [ -z "$target_epoch" ] || [ "$target_epoch" -le "$now_epoch" ]; then
    target_epoch="$(date -u -d "tomorrow ${BACKUP_TIME}" +%s)"
  fi
  echo $(( target_epoch - now_epoch ))
}

log "Backup sidecar started. Daily run time: ${BACKUP_TIME} UTC"

while true; do
  WAIT_SECONDS="$(seconds_until_next_run)"
  log "Sleeping ${WAIT_SECONDS}s until next backup run (${BACKUP_TIME} UTC)"
  sleep "$WAIT_SECONDS"
  log "Running scheduled backup"
  if bash /scripts/backup.sh --verbose; then
    log "Backup run finished OK"
  else
    log "Backup run FAILED (see output above; backup.sh already sent notifications)"
  fi
  # Guard against firing twice if the run itself took less than a minute.
  sleep 60
done
