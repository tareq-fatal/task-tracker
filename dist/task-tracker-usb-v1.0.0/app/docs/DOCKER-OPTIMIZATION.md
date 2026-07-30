# Docker image optimization

This documents the production image on `chore/docker-optimize` and how it was
slimmed vs. the previous Debian image.

## What changed

| Area | Before | After |
| --- | --- | --- |
| Base image | `node:20-bookworm-slim` (Debian/glibc) | `node:20-alpine` (musl) |
| Runtime `node_modules` | **Full** `node_modules` copied from the builder — every dev dependency (Playwright, Capacitor, Vitest, tsx, TypeScript, …) shipped in the final image | Only Next.js' **traced** production deps from `.next/standalone`, plus small overlays for the generated Prisma client + engine and the argon2 native addon |
| Prisma CLI (for on-boot `migrate deploy`) | Came "for free" inside the full `node_modules` | Dedicated `migrate-deps` stage installs **only** the Prisma CLI (+engines), pinned to the lockfile version, into `/app/.prisma-cli` |
| npm install caching | none | BuildKit `--mount=type=cache` on the npm store |
| Non-root | ✅ `nextjs` user | ✅ `nextjs` user (unchanged) |
| Healthcheck | compose-only | compose **and** image (`HEALTHCHECK` in the Dockerfile) |
| Secrets | plaintext env / `env_file` | Docker secrets via the `*_FILE` convention (entrypoint expands them) |
| `.dockerignore` | reasonable | tightened — excludes `secrets/`, `android`, `docs`, `releases`, `*.tar.gz`, all `*.md`, mobile/Capacitor, e2e-live, worker, scripts, … |

The dominant win is dropping the full-`node_modules` copy. `output: "standalone"`
(already set in `next.config.mjs`) makes Next.js trace exactly the production
modules `server.js` needs; the old Dockerfile then copied the entire dev
`node_modules` on top, which defeated it.

## Size comparison

Measured (`docker images`, Docker 29.4.0 / linux-amd64), both built from the same
commit's working tree via `scripts/docker-size-compare.sh`:

| Image | Base | Runtime `node_modules` | **Size** |
| --- | --- | --- | --- |
| **before** (`main`) | bookworm-slim | full dev+prod tree copied in | **1.5 GB** |
| **after** (this branch) | alpine | traced prod + small overlays + Prisma CLI | **444 MB** |

→ **~70 % smaller (~1.06 GB saved)**, dominated by no longer shipping the dev
toolchain. Re-run `./scripts/docker-size-compare.sh` any time to reproduce.

### Verified end-to-end

The `after` image was smoke-tested against a real Postgres (`docker compose`):

- `prisma migrate deploy` on boot → *"All migrations have been successfully
  applied."* (musl schema engine in the `migrate-deps` stage works)
- Next.js standalone server → *"Ready in 240ms"*
- `GET /login` → **HTTP 200** (17 KB); container reports **`healthy`** (the
  Dockerfile `HEALTHCHECK` passes) — so the traced deps, generated Prisma client,
  and `@node-rs/argon2` musl addon all load at runtime.

### Further trims (not taken here)

- Drop the `.prisma` / `@node-rs` safety overlays once a run confirms Next.js
  standalone traces the Prisma engine + argon2 addon (~70 MB).
- Narrow `schema.prisma` `binaryTargets` to musl-only for the image build to
  shed the unused `debian-openssl-3.0.x` engine (~20 MB). Not done here to avoid
  touching a file with unrelated uncommitted work on this checkout.

## Why Alpine (and not distroless)

- `prisma generate` runs **inside** the Alpine builder, so the generated
  client's `"native"` engine already resolves to `linux-musl-openssl-3.0.x` — no
  `schema.prisma` change needed.
- `@node-rs/argon2` ships a musl prebuilt (`@node-rs/argon2-linux-x64-musl`).
- Distroless was rejected: it has no shell for the migrate-on-boot entrypoint and
  no `libssl` for Prisma's engine without fragile manual library copies.

## Self-migration & secrets

`docker-entrypoint.sh`:

1. Expands any `<VAR>_FILE` into `<VAR>` (Docker secrets → env), for
   `DATABASE_URL`, `SESSION_SECRET`, `VAPID_PRIVATE_KEY`, `ADMIN_PASSWORD`,
   `DEMO_PASSWORD`.
2. Runs `prisma migrate deploy` from the dedicated CLI tree.
3. `exec`s the standalone server.

## Build & run

```bash
# Standalone stack (Postgres + app) with secrets + healthchecks:
cp secrets/session_secret.txt.example   secrets/session_secret.txt
cp secrets/postgres_password.txt.example secrets/postgres_password.txt
cp secrets/database_url.txt.example      secrets/database_url.txt   # keep passwords in sync
docker compose up -d --build

# Just the image:
docker build -t task-tracker:latest .
```
