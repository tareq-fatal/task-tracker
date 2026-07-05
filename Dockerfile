# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Task Tracker — production image (Next.js standalone + Prisma/PostgreSQL)
#
# Multi-stage, Alpine/musl, non-root, BuildKit npm cache:
#   1. deps         — full deps (incl. dev) for the build; cached npm store
#   2. builder      — `next build` → .next/standalone (server.js + traced deps)
#   3. migrate-deps — JUST the Prisma CLI (+engines) for `migrate deploy` on boot
#   4. runner       — minimal runtime: standalone server + static + Prisma CLI
#
# Why this is small: the runner ships only Next.js' *traced* production
# node_modules (from standalone) plus the tiny generated-client + native-addon
# overlays and a dedicated Prisma-CLI tree — NOT the multi-hundred-MB dev
# toolchain (playwright, capacitor, vitest, tsx, …).
#
# Base: node:20-alpine. `prisma generate` runs INSIDE this musl image, so the
# generated client's "native" engine already resolves to
# linux-musl-openssl-3.0.x — no schema change required. openssl is added for the
# engine's TLS; libc6-compat smooths over the occasional glibc-linked prebuilt.
# ---------------------------------------------------------------------------

FROM node:20-alpine AS base
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- 1. deps -------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
# Cache the npm store across builds; node_modules itself stays in the layer.
RUN --mount=type=cache,target=/root/.npm npm ci

# ---- 2. builder ----------------------------------------------------------
FROM base AS builder
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `npm run build` = `prisma generate && next build`; standalone output is
# configured in next.config.mjs (output: "standalone").
RUN npm run build

# ---- 3. migrate-deps -----------------------------------------------------
# The Prisma CLI is a devDependency and NOT part of the traced runtime, but the
# container migrates itself on boot. Install ONLY the CLI (pinned to the lockfile
# version) into its own tree. Scripts MUST run here — @prisma/engines' postinstall
# downloads the musl *schema* engine that `migrate deploy` needs (the traced
# client only carries the query engine). --no-save keeps package.json untouched.
FROM base AS migrate-deps
ENV NODE_ENV=production
RUN --mount=type=cache,target=/root/.npm \
    npm install --no-save prisma@5.22.0

# ---- 4. runner -----------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    PATH=/app/node_modules/.bin:$PATH

# Unprivileged runtime user (BusyBox adduser/addgroup — short flags only).
RUN addgroup -S -g 1001 nodejs \
    && adduser  -S -u 1001 -G nodejs nextjs

# Standalone server: server.js + Next.js-traced production node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Static assets + public dir are NOT part of standalone — copy separately.
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Safety overlays for the two things standalone tracing is flaky about: the
# generated Prisma client (+musl query engine) and the argon2 native addon.
# Cheap insurance (~20 MB) against a runtime "engine not found" / missing .node.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@node-rs ./node_modules/@node-rs
# Prisma schema + migrations for `migrate deploy`.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# Prisma CLI (+engines) in a dedicated dir so it never clobbers standalone's
# traced node_modules. The entrypoint invokes it from here.
COPY --from=migrate-deps --chown=nextjs:nodejs /app/node_modules ./.prisma-cli/node_modules

# Uploaded attachments (mount a volume here to persist across deploys).
RUN mkdir -p /app/public/uploads && chown -R nextjs:nodejs /app/public/uploads

COPY --chown=nextjs:nodejs docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER nextjs
EXPOSE 3000

# Container-level liveness: the login page must render (also covers DB-less boot).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Apply pending DB migrations, then start the Next.js server.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
