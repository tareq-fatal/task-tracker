# Deployment

The app is a **standard Node.js Next.js server** (it needs a server runtime for
cookie auth, Prisma and file uploads — it is **not** a static export).

## TL;DR recommendation

| Target              | SQLite OK? | Notes                                                            |
| ------------------- | ---------- | --------------------------------------------------------------- |
| **VPS / Docker**    | ✅ Yes      | Simplest. Persistent disk for `dev.db` + `public/uploads`.      |
| **Vercel**          | ⚠️ Use Postgres | Vercel filesystem is read-only/ephemeral — switch DB to Postgres and uploads to object storage. |
| **Cloudflare Pages**| ❌ Not directly | Needs an edge rewrite: D1 instead of SQLite, R2 for uploads, no Node `fs`. Larger effort. |

For Coast-Shield-style self-hosting, the **VPS option** below is the fastest path.

---

## Option A — VPS / Docker (recommended, keeps SQLite)

### Bare VPS

```bash
git clone <repo> && cd task-tracker
npm ci
cp .env.example .env            # then edit SESSION_SECRET + admin password!
npx prisma migrate deploy        # apply migrations (no seed)
npm run seed                     # optional: demo data
npm run build
npm start                        # serves on :3000 (set PORT to change)
```

Put it behind nginx/Caddy for TLS. Persist these paths across deploys:

- `prisma/dev.db` (the database)
- `public/uploads` (attachments)

### Docker

```dockerfile
FROM node:20-slim
WORKDIR /app
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
```

```bash
docker build -t task-tracker .
docker run -d -p 3000:3000 \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -v $PWD/data/db:/app/prisma \
  -v $PWD/data/uploads:/app/public/uploads \
  task-tracker
```

---

## Option B — Vercel (switch to Postgres)

1. Create a Postgres DB (Neon / Vercel Postgres / Supabase).
2. In `prisma/schema.prisma` change:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
3. Set env vars in Vercel: `DATABASE_URL`, `SESSION_SECRET`, admin/demo vars,
   and (optionally) the VAPID push keys.
4. Run `npx prisma migrate deploy` against the new DB (e.g. in a CI step or
   locally with the prod `DATABASE_URL`).
5. **Uploads:** the local-disk upload in `src/actions/tasks.ts`
   (`uploadAttachmentAction`) must be swapped for object storage
   (Vercel Blob / S3 / R2) since Vercel has no writable disk.

Deploy with `vercel` or by connecting the Git repo.

---

## Option C — Cloudflare Pages / Workers

Cloudflare runs on the edge runtime and cannot use Node `fs` or a local SQLite
file. To ship there you would:

- Replace Prisma+SQLite with **D1** (Cloudflare's SQLite) via the Prisma D1
  adapter, or with Drizzle.
- Replace file uploads with **R2**.
- Use `@cloudflare/next-on-pages` to build, and move auth/session reads to the
  edge runtime.

This is a meaningful refactor — prefer **Option A (VPS)** unless edge hosting is
a hard requirement.

---

## Production checklist

- [ ] Set a strong, random `SESSION_SECRET` (e.g. `openssl rand -hex 32`).
- [ ] Change the default admin password (`ADMIN_PASSWORD`) before first deploy,
      or change it in **Settings** right after seeding.
- [ ] Run `npx prisma migrate deploy` (not `migrate dev`) in production.
- [ ] Persist `prisma/*.db` and `public/uploads` (Option A) or migrate to
      Postgres + object storage (Option B/C).
- [ ] (Optional) Configure VAPID keys to enable push notifications.
- [ ] Serve over HTTPS — required for PWA install and web-push.
