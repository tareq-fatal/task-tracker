#!/usr/bin/env bash
# =============================================================================
# Task Tracker — deploy / redeploy on the Coast-Shield VPS.
#
# Run this ON THE VPS (ssh root@13.140.146.101 first), from the prod infra dir
# that holds docker-compose.prod.yml (or the standalone compose fragment).
#
#   ./deploy-tasks.sh          # pull, build, (re)start the service
#   ./deploy-tasks.sh --seed   # ...and run the one-off DB seed afterwards
#                              #   (FIRST DEPLOY ONLY — seeding WIPES tasks!)
#
# Idempotent: safe to re-run for every redeploy. `prisma migrate deploy` runs
# automatically inside the container on boot.
# =============================================================================
set -euo pipefail

# --- Config (edit to match the VPS) ------------------------------------------
APP_DIR="${APP_DIR:-/home/marisight/apps/task-tracker}"            # cloned repo
COMPOSE_DIR="${COMPOSE_DIR:-/home/marisight/marisight/infra/prod}"  # holds the compose file
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"             # or docker-compose.task-tracker.yml
SERVICE="task-tracker"
REPO_URL="${REPO_URL:-https://github.com/<your-org>/task-tracker.git}" # CONFIRM
BRANCH="${BRANCH:-main}"

SEED=0
[ "${1:-}" = "--seed" ] && SEED=1

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

# --- 1. Sync the source ------------------------------------------------------
if [ ! -d "$APP_DIR/.git" ]; then
  log "Cloning repo into $APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi
log "Updating source ($BRANCH)"
git -C "$APP_DIR" fetch --all --prune
git -C "$APP_DIR" checkout "$BRANCH"
git -C "$APP_DIR" pull --ff-only

# --- 2. Build the image ------------------------------------------------------
log "Building task-tracker:latest"
docker build -t task-tracker:latest "$APP_DIR"

# --- 3. (Re)start the service ------------------------------------------------
cd "$COMPOSE_DIR"
log "Starting $SERVICE (migrations apply automatically on boot)"
docker compose -f "$COMPOSE_FILE" up -d "$SERVICE"

# --- 4. Optional first-time seed --------------------------------------------
if [ "$SEED" = "1" ]; then
  log "Seeding database (one-off — WIPES existing tasks/projects/teams)"
  docker compose -f "$COMPOSE_FILE" exec -T "$SERVICE" npx prisma db seed
fi

# --- 5. Status ---------------------------------------------------------------
log "Recent logs"
docker compose -f "$COMPOSE_FILE" logs --tail=30 "$SERVICE" || true
log "Service status"
docker compose -f "$COMPOSE_FILE" ps "$SERVICE"

log "Done. Public URL → https://tasks.coastshield.net"
