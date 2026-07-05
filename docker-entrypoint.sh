#!/bin/sh
# Production container entrypoint.
#   1. Expands Docker/Swarm *_FILE secrets into their env vars.
#   2. Applies pending Prisma migrations (idempotent — safe on every boot).
#   3. Hands off to the CMD (the Next.js standalone server).
#
# NOTE: seeding is NOT run here. The seed script wipes & recreates demo data,
# so it must only be run deliberately as a one-off — see docs/PRODUCTION-DEPLOY.md.
set -e

# --- Docker secrets: expand any <VAR>_FILE into <VAR> ------------------------
# Lets compose/swarm mount secrets as files (e.g. /run/secrets/session_secret)
# and pass SESSION_SECRET_FILE=/run/secrets/session_secret instead of baking the
# plaintext into the environment. If <VAR> is already set it is left untouched;
# <VAR>_FILE wins only when <VAR> is empty.
for var in DATABASE_URL SESSION_SECRET VAPID_PRIVATE_KEY ADMIN_PASSWORD DEMO_PASSWORD; do
  eval cur_val="\${$var:-}"
  eval file_path="\${${var}_FILE:-}"
  if [ -z "$cur_val" ] && [ -n "$file_path" ]; then
    if [ -f "$file_path" ]; then
      export "$var=$(cat "$file_path")"
      echo "[entrypoint] Loaded $var from \$${var}_FILE"
    else
      echo "[entrypoint] WARNING: ${var}_FILE=$file_path does not exist" >&2
    fi
  fi
done

PRISMA_CLI=/app/.prisma-cli/node_modules/prisma/build/index.js

echo "[entrypoint] Applying database migrations (prisma migrate deploy)…"
node "$PRISMA_CLI" migrate deploy

echo "[entrypoint] Migrations applied. Starting app: $*"
exec "$@"
