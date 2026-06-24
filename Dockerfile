# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Task Tracker — production image (Next.js standalone + Prisma/PostgreSQL)
#
# Multi-stage:
#   1. deps    — install all npm deps (incl. dev: prisma, tsx) with layer cache
#   2. builder — prisma generate + next build (emits .next/standalone)
#   3. runner  — slim runtime; runs `prisma migrate deploy` then `node server.js`
#
# Base: debian bookworm-slim → OpenSSL 3.0, matches the schema's
# `debian-openssl-3.0.x` Prisma binary target and runs the @node-rs/argon2
# native addon without musl headaches.
# ---------------------------------------------------------------------------

FROM node:20-bookworm-slim AS base
# openssl is required by Prisma's engines at runtime; ca-certificates for TLS.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- 1. deps -------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- 2. builder ----------------------------------------------------------
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate the Prisma client (with the Linux engine) and build the standalone app.
RUN npx prisma generate && npm run build

# ---- 3. runner -----------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    PATH=/app/node_modules/.bin:$PATH

# Run as an unprivileged user.
RUN groupadd --system --gid 1001 nodejs \
    && useradd  --system --uid 1001 --gid nodejs nextjs

# Standalone server (server.js + pruned .next + minimal node_modules).
COPY --from=builder /app/.next/standalone ./
# Static assets and the public dir (PWA manifest, icons, sw.js) are NOT part of
# standalone and must be copied separately.
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Prisma schema + migrations so `migrate deploy` / `db seed` can run in-container.
COPY --from=builder /app/prisma ./prisma
# Full node_modules from the builder: gives us the generated Prisma client +
# Linux query engine, the Prisma CLI (migrate deploy) and tsx (db seed). This
# trades a little image size for a self-contained image that can migrate & seed
# itself — the right call for a single internal app.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Uploaded attachments live here; mount a volume to persist across deploys.
RUN mkdir -p /app/public/uploads && chown -R nextjs:nodejs /app/public/uploads

COPY --chown=nextjs:nodejs docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER nextjs
EXPOSE 3000

# Apply pending DB migrations, then start the Next.js server.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
