#!/usr/bin/env bash
# =============================================================================
# Task Tracker — MCP onboarding in one command.
#
# Turns "a new mandant should be able to drive the tracker from Claude Code"
# into a single line. Run this ON THE VPS:
#
#   bash infra/mcp-setup.sh --tenant-name "Tarek & Claude" --slug tarek-claude \
#        --owner-name Claude --owner-username claude \
#        --owner-email claude@tasks.coastshield.net --owner-password '…' \
#        --token-label "Claude Code" --scopes read,write
#
# It performs, in order and idempotently:
#   1. prisma migrate deploy   (safe on every run; also runs on container boot)
#   2. tenant + owner account  (created only when missing — see infra/mcp-setup.mjs)
#   3. machine token           (reused when an active one with the same label
#                               exists; --rotate-token forces a fresh one)
#   4. END-TO-END VERIFY       — the freshly minted token is used against the
#                               live GET /api/mcp and must come back 200 with
#                               the expected user and tenant. This is what makes
#                               step 3 trustworthy: the endpoint runs the real
#                               src/lib/api-token.ts, so a mismatch fails here
#                               instead of handing out a token that 401s.
#
# Re-running with the same arguments changes nothing and prints the same summary.
# =============================================================================
set -euo pipefail

SERVICE="${SERVICE:-task-tracker}"                       # container name
APP_URL="${APP_URL:-https://tasks.coastshield.net}"      # public base URL
PRISMA_CLI="/app/.prisma-cli/node_modules/prisma/build/index.js"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER="${WORKER:-$HERE/mcp-setup.mjs}"

log()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m✖ %s\033[0m\n\n' "$*" >&2; exit 1; }

[ -f "$WORKER" ] || fail "worker script not found: $WORKER"
docker inspect -f '{{.State.Running}}' "$SERVICE" 2>/dev/null | grep -qx true \
  || fail "container '$SERVICE' is not running — deploy first (infra/deploy-tasks.sh)"

# --- 1. Migrations -----------------------------------------------------------
log "Applying database migrations (idempotent)"
docker exec "$SERVICE" node "$PRISMA_CLI" migrate deploy

# --- 2./3. Tenant, owner, token ---------------------------------------------
log "Ensuring tenant, owner account and MCP token"
# Must land in /app, not /tmp: Node resolves node_modules by walking up from the
# script, and the Prisma client + argon2 addon live in /app/node_modules.
docker cp "$WORKER" "$SERVICE:/app/.mcp-setup.mjs" >/dev/null
OUT="$(docker exec "$SERVICE" node /app/.mcp-setup.mjs "$@")" || {
  printf '%s\n' "$OUT" >&2
  fail "setup worker failed"
}
# -u 0: docker cp lands the file as root, the container itself runs as nextjs.
docker exec -u 0 "$SERVICE" rm -f /app/.mcp-setup.mjs 2>/dev/null || true

# Everything except the machine-readable tail is for the operator to read.
printf '%s\n' "$OUT" | grep -v '^SETUP_RESULT '
RESULT="$(printf '%s\n' "$OUT" | sed -n 's/^SETUP_RESULT //p' | tail -1)"
[ -n "$RESULT" ] || fail "worker produced no SETUP_RESULT line"

# The payload is flat and machine-written (hex token, slug, username — no
# escapes, no nesting to walk), so sed is enough and keeps this dependency-free.
RAW="$(printf '%s' "$RESULT" | sed -n 's/.*"raw":"\([^"]*\)".*/\1/p')"
SLUG="$(printf '%s' "$RESULT" | sed -n 's/.*"slug":"\([^"]*\)".*/\1/p')"
USERNAME="$(printf '%s' "$RESULT" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p')"

# --- 4. End-to-end verification ---------------------------------------------
if [ -n "$RAW" ]; then
  log "Verifying the token against $APP_URL/api/mcp"
  BODY="$(curl -sS --max-time 20 -H "Authorization: Bearer $RAW" "$APP_URL/api/mcp" \
          -w '\n%{http_code}')"
  CODE="$(printf '%s' "$BODY" | tail -1)"
  BODY="$(printf '%s' "$BODY" | sed '$d')"
  [ "$CODE" = "200" ] || fail "GET /api/mcp returned HTTP $CODE (expected 200): $BODY"
  printf '%s' "$BODY" | grep -q "\"username\":\"$USERNAME\"" \
    || fail "token resolves to the wrong user — expected '$USERNAME': $BODY"
  printf '%s' "$BODY" | grep -q "\"slug\":\"$SLUG\"" \
    || fail "token resolves to the wrong mandant — expected '$SLUG': $BODY"
  printf '\n  ✔ HTTP 200 — token acts as %s in mandant %s\n' "$USERNAME" "$SLUG"

  cat <<EOF

  ┌─ Set this on the machine that runs Claude Code ─────────────────────────────
  │
  │   export TASK_TRACKER_URL="$APP_URL"
  │   export TASK_TRACKER_TOKEN="$RAW"
  │
  │   PowerShell:
  │   \$env:TASK_TRACKER_URL="$APP_URL"
  │   \$env:TASK_TRACKER_TOKEN="$RAW"
  │
  └─ Shown once — it cannot be recovered. Re-run with --rotate-token if lost. ──

EOF
else
  log "No new token minted — the existing one stays valid"
  printf '  (nothing to verify: the raw value of an existing token is not recoverable)\n'
  printf '  Re-run with --rotate-token to replace it.\n\n'
fi

log "Done — mandant '$SLUG', user '$USERNAME'"
