#!/usr/bin/env bash
# =============================================================================
# OBJ-FSM — build the static PWA locally and ship it to the Coast-Shield VPS.
#
# Runs ON YOUR LOCAL MACHINE (Git Bash / WSL / macOS / Linux), because OBJ-FSM
# is a separate repo and Vite bakes env at build time. Needs SSH access to the
# VPS (the same key/login you use for `ssh root@13.140.146.101`).
#
#   ./deploy-fsm.sh              # build + sync
#   SKIP_BUILD=1 ./deploy-fsm.sh # sync the existing dist/ without rebuilding
#
# Incremental via rsync when available, otherwise a clean tar-over-ssh upload.
# =============================================================================
set -euo pipefail

# --- Config (override via env) -----------------------------------------------
FSM_DIR="${FSM_DIR:-$HOME/source/OBJ-FSM}"   # local OBJ-FSM repo
VPS_HOST="${VPS_HOST:-root@13.140.146.101}"
REMOTE_DIR="${REMOTE_DIR:-/srv/obj-fsm}"
SSH_PORT="${SSH_PORT:-22}"

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

[ -d "$FSM_DIR" ] || { echo "OBJ-FSM repo not found at: $FSM_DIR (set FSM_DIR=...)"; exit 1; }

# --- 1. Build ----------------------------------------------------------------
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  log "Building OBJ-FSM ($FSM_DIR)"
  [ -d "$FSM_DIR/node_modules" ] || ( cd "$FSM_DIR" && npm ci )
  ( cd "$FSM_DIR" && npm run build )
fi

DIST="$FSM_DIR/dist"
[ -f "$DIST/index.html" ] || { echo "Build output missing: $DIST/index.html"; exit 1; }

# --- 2. Ensure remote dir ----------------------------------------------------
log "Preparing $VPS_HOST:$REMOTE_DIR"
ssh -p "$SSH_PORT" "$VPS_HOST" "mkdir -p '$REMOTE_DIR'"

# --- 3. Upload ---------------------------------------------------------------
if command -v rsync >/dev/null 2>&1; then
  log "Syncing dist/ → $REMOTE_DIR (rsync, incremental + --delete)"
  rsync -avz --delete -e "ssh -p $SSH_PORT" "$DIST/" "$VPS_HOST:$REMOTE_DIR/"
else
  log "rsync not found — clean tar-over-ssh upload"
  ssh -p "$SSH_PORT" "$VPS_HOST" "rm -rf '$REMOTE_DIR'/* '$REMOTE_DIR'/.[!.]* 2>/dev/null || true"
  tar -C "$DIST" -czf - . | ssh -p "$SSH_PORT" "$VPS_HOST" "tar -C '$REMOTE_DIR' -xzf -"
fi

log "Done. Public URL → https://fsm.coastshield.net"
echo "Note: first time only — add infra/Caddyfile.obj-fsm to the Caddyfile,"
echo "mount $REMOTE_DIR into the caddy container, then reload Caddy."
