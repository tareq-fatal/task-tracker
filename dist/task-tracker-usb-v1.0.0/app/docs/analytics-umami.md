# Analytics — self-hosted Umami

Task Tracker ships with optional, privacy-friendly product analytics via
[Umami](https://umami.is), self-hosted alongside the app.

## Why Umami

- No cookies, no cross-site tracking, no fingerprinting — nothing that
  requires a cookie-consent banner under GDPR.
- Data stays on our own infrastructure (Postgres container next to the app).
- Tracks page views plus a small set of custom product events (below).

Analytics is **off by default**. It only activates when both
`NEXT_PUBLIC_UMAMI_SRC` and `NEXT_PUBLIC_UMAMI_WEBSITE_ID` are set — see
[.env.example](../.env.example).

## Custom events

| Event name       | Fired when                          | Where |
|-------------------|--------------------------------------|-------|
| `Task-Created`    | A new task is created                 | `src/lib/analytics.ts` (`ANALYTICS_EVENTS.TASK_CREATED`) |
| `Task-Completed`  | A task's status changes to done       | `ANALYTICS_EVENTS.TASK_COMPLETED` |
| `Sprint-Closed`   | A sprint is closed                    | `ANALYTICS_EVENTS.SPRINT_CLOSED` |

Event names and payload keys are centralized in
[`src/lib/analytics.ts`](../src/lib/analytics.ts):

- `trackEvent(name, data?)` — call from client components/handlers.
- `trackServerEvent(name, data?)` — call from server actions/route handlers;
  fire-and-forget, never throws, so it can't break the request it's attached to.

Event payloads only ever carry non-identifying context (e.g. project/team
name, task priority) — never emails, usernames, or free-text task content.

## Local development

Analytics is disabled by default in dev (env vars unset). To test it locally,
run Umami with Docker and point the app at it:

```bash
docker run -d --name umami-db -e POSTGRES_DB=umami -e POSTGRES_USER=umami \
  -e POSTGRES_PASSWORD=umami -p 5433:5432 postgres:16-alpine

docker run -d --name umami -p 3001:3000 \
  -e DATABASE_URL=postgresql://umami:umami@host.docker.internal:5433/umami \
  -e APP_SECRET=dev-secret \
  ghcr.io/umami-software/umami:postgresql-latest
```

Open `http://localhost:3001` (default login `admin` / `umami`), add a
website, then set in `.env`:

```
NEXT_PUBLIC_UMAMI_SRC="http://localhost:3001/script.js"
NEXT_PUBLIC_UMAMI_WEBSITE_ID="<website-id-from-dashboard>"
```

## Production deployment (Coast-Shield VPS)

Same merge-fragment pattern as the app itself
(see [`infra/docker-compose.task-tracker.yml`](../infra/docker-compose.task-tracker.yml)).

1. Copy the env template and fill in secrets:
   ```bash
   cp infra/.env.umami.example .env.umami
   # UMAMI_DB_PASSWORD, UMAMI_APP_SECRET — generate with: openssl rand -hex 32
   ```
2. Merge the `umami` + `umami-db` services from
   [`infra/docker-compose.umami.yml`](../infra/docker-compose.umami.yml) into
   the Coast-Shield `docker-compose.prod.yml` (or run standalone with
   `docker compose -f infra/docker-compose.umami.yml --env-file .env.umami up -d`).
3. Append the site block from
   [`infra/Caddyfile.umami`](../infra/Caddyfile.umami) to the Coast-Shield
   Caddyfile and reload Caddy:
   ```bash
   docker exec caddy caddy reload --config /etc/caddy/Caddyfile
   ```
4. Visit `https://analytics.coastshield.net`, create the first admin account,
   add a website for the Task Tracker production domain, and copy its
   website ID.
5. Set on the Task Tracker service (`.env.task-tracker`):
   ```
   NEXT_PUBLIC_UMAMI_SRC="https://analytics.coastshield.net/script.js"
   NEXT_PUBLIC_UMAMI_WEBSITE_ID="<website-id>"
   ```
   and redeploy (`infra/deploy-tasks.sh`) so the build picks up the new
   `NEXT_PUBLIC_*` values.

## Verifying it's live

- Load the app, open devtools → Network, confirm a request to
  `.../script.js` and periodic `POST .../api/send` calls.
- In the Umami dashboard, check **Realtime** for the page view.
- Trigger a task creation/completion or sprint close and confirm the
  matching custom event appears under **Events**.
