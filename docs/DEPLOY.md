# Deployment

> 🚀 **Deploying the Coast-Shield instance** (`tasks.coastshield.net`)? Follow
> [PRODUCTION-DEPLOY.md](PRODUCTION-DEPLOY.md) instead — it has the exact,
> environment-specific steps (server, DNS, existing Postgres, Caddy). This
> page is the general-purpose guide for any other target.

The app is a standard Node.js Next.js server — it needs a server runtime for
cookie auth, Prisma and file uploads (it is **not** a static export), and it
talks to **PostgreSQL** (Prisma's `datasource` provider is `postgresql`).

## TL;DR recommendation

| Target | Effort | Notes |
| --- | --- | --- |
| **VPS / Docker** | Low | Recommended. One container, a Postgres instance (existing or new), persistent volume for uploads. |
| **Vercel** | Medium | Works, but the local-disk attachment upload must be swapped for object storage (Vercel Blob / S3 / R2) since Vercel's filesystem is read-only/ephemeral. |
| **Cloudflare Pages/Workers** | High | Edge runtime has no Node `fs` — needs a real rewrite (D1 or an HTTP-reachable Postgres, R2 for uploads, `@cloudflare/next-on-pages`). Only worth it if edge hosting is a hard requirement. |

## Environment variables

Copy `.env.example` to `.env` (or set these directly in your host's env panel):

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `SESSION_SECRET` | ✅ | Signs session cookies — generate with `openssl rand -hex 32` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_EMAIL` | ✅ (seed only) | Seeded admin account — **change the password before/at first login** |
| `DEMO_PASSWORD` | seed only | Password for the demo users (alice/bob/charlie) |
| `NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS` | ✅ | Must be `"false"` in production |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | optional | Enables Web Push — see [NOTIFICATIONS.md](NOTIFICATIONS.md) |
| `RESEND_API_KEY` | optional | Enables email notifications — see [NOTIFICATIONS.md](NOTIFICATIONS.md) |
| `FCM_SERVER_KEY` | optional | Enables native push to the Android app — see [NOTIFICATIONS.md](NOTIFICATIONS.md) |
| `SYNC_SECRET` | optional | Required if you call `/api/sync/planner`, `/api/cron/notifications`, `/api/cron/recurring` or `/api/cron/notification-retention` from an external scheduler |
| `AZURE_AD_CLIENT_ID` / `AZURE_AD_CLIENT_SECRET` / `AZURE_AD_TENANT_ID` | optional | MS Planner sync + Azure AD SSO — see [PLANNER-SYNC.md](PLANNER-SYNC.md) / [SSO-SETUP.md](SSO-SETUP.md) |
| Provider-specific SSO vars (Google/GitHub/Apple client id/secret) | optional | See [SSO-SETUP.md](SSO-SETUP.md) |

## Option A — VPS / Docker (recommended)

```bash
git clone <repo> && cd task-tracker
npm ci
cp .env.example .env             # then set DATABASE_URL, SESSION_SECRET, admin password
npx prisma migrate deploy        # apply migrations — never `migrate dev` in prod
npm run seed                     # optional: demo data (skip on a real deploy)
npm run build
npm start                        # serves on :3000 (set PORT to override)
```

Put it behind nginx/Caddy for TLS. Persist `public/uploads` (attachments)
across deploys/restarts — it's the only local state besides the database.

### Docker

The repo ships a production `Dockerfile` (3-stage: deps → builder → runner,
`node:20-bookworm-slim`, non-root user, `output: "standalone"` build) and
`docker-entrypoint.sh`, which runs `prisma migrate deploy` on every container
boot before starting the server — migrations are idempotent, so this is safe
to run on every restart.

```bash
docker build -t task-tracker .
docker run -d -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/tasktracker?schema=public" \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -v $PWD/data/uploads:/app/public/uploads \
  task-tracker
```

For a full Compose + Caddy setup with an existing Postgres instance, see the
templates under [`infra/`](../infra) (`docker-compose.task-tracker.yml`,
`Caddyfile.task-tracker`, `.env.task-tracker.example`, `deploy-tasks.sh`) —
these are what [PRODUCTION-DEPLOY.md](PRODUCTION-DEPLOY.md) uses on the
Coast-Shield VPS, but the templates are reusable for any similar host.

## Option B — Vercel

1. Create a Postgres DB (Neon / Vercel Postgres / Supabase) and set `DATABASE_URL`.
2. Set the other required env vars (see table above) in the Vercel project settings.
3. Run `npx prisma migrate deploy` against the production `DATABASE_URL` (a CI
   step, or locally with the prod connection string).
4. **Uploads**: swap the local-disk write in `uploadAttachmentAction`
   (`src/actions/tasks.ts`) for object storage (Vercel Blob / S3 / R2) —
   Vercel's filesystem is read-only/ephemeral.

Deploy with `vercel` or by connecting the Git repo.

## Option C — Cloudflare Pages / Workers

Cloudflare's edge runtime cannot use Node `fs` or talk directly to a local
Postgres socket. To ship there:

- Point Prisma at Cloudflare **D1**, or at Postgres via an HTTP-compatible
  driver (e.g. Neon's serverless driver / Hyperdrive).
- Replace file uploads with **R2**.
- Build with `@cloudflare/next-on-pages` and move any Node-only code (argon2
  native bindings included) to something edge-compatible.

This is a meaningful refactor — prefer **Option A** unless edge hosting is a
hard requirement.

## Production checklist

- [ ] Strong, random `SESSION_SECRET` (`openssl rand -hex 32`)
- [ ] Changed the default admin password before/at first login
- [ ] `NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS="false"`
- [ ] Ran `npx prisma migrate deploy` (not `migrate dev`)
- [ ] `public/uploads` persisted across restarts/deploys (volume or object storage)
- [ ] Database backups scheduled (`pg_dump` on a cron, or your host's managed backups)
- [ ] Serving over HTTPS — required for PWA install and Web Push
- [ ] (Optional) VAPID keys set for Web Push, `RESEND_API_KEY` for email notifications
- [ ] (Optional) `npm run audit:tenant` passes clean before a release — no unscoped tenant queries
