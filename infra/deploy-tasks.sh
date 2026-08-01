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
REPO_URL="${REPO_URL:-https://github.com/tareq-fatal/task-tracker.git}"
BRANCH="${BRANCH:-main}"

SEED=0
[ "${1:-}" = "--seed" ] && SEED=1

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

# --- 1. Sync the source ------------------------------------------------------
# SKIP_GIT=1: der Aufrufer hat den Quellcode bereits nach $APP_DIR gelegt
# (GitHub-Actions-Weg: git archive | tar über den restricted Deploy-Key —
# das Repo auf dem VPS ist KEIN git-Clone und braucht keine GitHub-Creds).
if [ "${SKIP_GIT:-0}" != "1" ]; then
  if [ ! -d "$APP_DIR/.git" ]; then
    log "Cloning repo into $APP_DIR"
    git clone "$REPO_URL" "$APP_DIR"
  fi
  log "Updating source ($BRANCH)"
  git -C "$APP_DIR" fetch --all --prune
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull --ff-only
else
  log "SKIP_GIT=1 — Quellcode wurde vom Aufrufer bereitgestellt"
fi

# --- 2. Pre-deploy safety net: DB dump + rollback image tag -------------------
# Same net as the deploy.yml workflow step — kept here too so MANUAL deploys
# get it as well. Skip with SKIP_BACKUP=1 (e.g. when rolling back).
if [ "${SKIP_BACKUP:-0}" != "1" ]; then
  STAMP="$(date -u +%Y%m%d-%H%M%S)"
  BACKUP_DIR="${BACKUP_DIR:-/home/marisight/backups/task-tracker/pre-deploy}"
  log "Pre-deploy DB dump -> $BACKUP_DIR/$STAMP.sql.gz"
  mkdir -p "$BACKUP_DIR"
  # Container per IMAGE erkennen — die Namen hier heissen marisight-db(-test),
  # "postgres" steht nur im Image. PG_CONTAINER uebersteuert die Erkennung.
  PGC="${PG_CONTAINER:-$(docker ps --format '{{.Names}}\t{{.Image}}' | awk -F'\t' 'tolower($2) ~ /postgres/ && $1 !~ /test/ {print $1; exit}')}"
  [ -n "$PGC" ] || { echo "no running postgres container found — aborting before deploy" >&2; exit 1; }
  docker exec "$PGC" sh -c 'pg_dump -U "${POSTGRES_USER:-postgres}" --format=plain --no-owner --no-privileges tasktracker' \
    | gzip -9 > "$BACKUP_DIR/$STAMP.sql.gz"
  [ -s "$BACKUP_DIR/$STAMP.sql.gz" ] || { echo "pre-deploy dump is empty — aborting" >&2; exit 1; }
  ls -1t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm --
  if docker image inspect task-tracker:latest >/dev/null 2>&1; then
    log "Tagging rollback image task-tracker:rollback-$STAMP"
    docker tag task-tracker:latest "task-tracker:rollback-$STAMP"
    docker tag task-tracker:latest task-tracker:rollback
  fi
fi

# --- 3. Build the image ------------------------------------------------------
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
