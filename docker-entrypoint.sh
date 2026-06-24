#!/bin/sh
# Production container entrypoint.
# Applies pending Prisma migrations (idempotent — safe to run on every boot),
# then hands off to the CMD (the Next.js standalone server).
#
# NOTE: seeding is NOT run here. The seed script wipes & recreates demo data,
# so it must only be run deliberately as a one-off — see docs/PRODUCTION-DEPLOY.md.
set -e

echo "[entrypoint] Applying database migrations (prisma migrate deploy)…"
node node_modules/prisma/build/index.js migrate deploy

echo "[entrypoint] Migrations applied. Starting app: $*"
exec "$@"
