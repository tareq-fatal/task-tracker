# API Reference

Task Tracker has almost no traditional REST API — nearly all reads/writes go
through Next.js **Server Actions** (RPC-style, `"use server"`, called directly
from React components, not fetched over HTTP by hand). Only external-facing
concerns (OAuth callbacks, webhooks/cron, push subscription, file download)
are plain HTTP **Route Handlers** under `src/app/api/` (+ two routes outside
`api/`: `/logout`, `/download/attachment/[id]`).

There is no shared JSON envelope — each Route Handler returns
`NextResponse.json(...)` with its own shape, and each Server Action returns a
plain object (commonly `{ ok: boolean, error?: string, data?: T }`, but this is
a convention, not an enforced contract — check the action's return type).

## Auth model

- **Session**: httpOnly, secure, `sameSite=lax` cookie (`tt_session`) holding an
  opaque token, checked against the `Session` table (`src/lib/auth.ts`).
- **Tenant**: resolved server-side per request (`src/lib/tenant.ts`). Regular
  users/Admins are hard-locked to their own tenant; BackendAdmin (`SuperAdmin`)
  may switch via the `tt_tenant` cookie or `/t/{slug}`.
- **Role gating**: `isAdminRole()` / `can(role, capability)` from `src/lib/roles.ts`,
  plus per-task checks in `src/lib/task-access.ts` (creator/admin/assignee rules).
- **External webhooks/cron**: no session — gated by a static `SYNC_SECRET`
  sent as an `x-sync-secret` header instead.

## Route Handlers (`src/app/api/**`, plus `/logout` and `/download/*`)

### Auth / SSO

| Route | Methods | Purpose |
| --- | --- | --- |
| `/api/auth/[provider]/start` | `GET` | Begins an OAuth flow for `provider` (`azure-ad`/`google`/`github`/`apple`); sets CSRF state |
| `/api/auth/[provider]/callback` | `GET`, `POST` | OAuth callback — verifies state, resolves tenant by email domain, links/auto-provisions a `UserIdentity`, opens a session |
| `/logout` | `GET` | Destroys the session, redirects to `/login` (303) — a dedicated GET route because it must work from a plain link inside the Capacitor WebView |

### Notifications

| Route | Methods | Purpose |
| --- | --- | --- |
| `/api/push` | `POST` | Registers a Web Push subscription for the current user |
| `/api/push` | `DELETE` | Removes a Web Push subscription |

### Attachments

| Route | Methods | Purpose |
| --- | --- | --- |
| `/download/attachment/[id]` | `GET` | Streams a task attachment with `Content-Disposition: attachment`; checks the requester can view the parent task before serving |

### Cron / external sync (all require `x-sync-secret`)

| Route | Methods | Purpose |
| --- | --- | --- |
| `/api/sync/planner` | `GET`, `POST` | Runs MS Planner pull/push/two-way sync for every enabled `PlannerSync` (see [PLANNER-SYNC.md](PLANNER-SYNC.md)) |
| `/api/cron/notifications` | `GET`, `POST` | Sends due-soon/overdue reminders, deduped ~20h per task/type (see [NOTIFICATIONS.md](NOTIFICATIONS.md)) |
| `/api/cron/recurring` | `GET`, `POST` | Expands tasks with a `recurringRule` into their next occurrence |

These are meant to be invoked by an external scheduler (cron, GitHub Actions,
a systemd timer on the VPS) — the app itself does not run a background job
loop.

## Server Actions (`src/actions/**`)

One file per resource; every action re-derives the current user + tenant
server-side (never trusts a client-supplied tenant/user id) before touching
the database.

| File | Covers |
| --- | --- |
| `auth.ts` | login, password change, session bootstrap |
| `tasks.ts` | task CRUD, status/priority/progress updates, comments, `markCommentsRead`, attachment upload, timer start/stop, `changeCreator` |
| `bulk.ts` | `bulkSetStatus`, `bulkDelete` (List view multi-select) |
| `projects.ts` | project CRUD, `ProjectMember` add/remove |
| `teams.ts` | team CRUD, team member add/remove |
| `sprints.ts` | sprint CRUD, assigning tasks to a sprint |
| `scrum.ts` | scrum-column moves |
| `workflow-columns.ts` | custom Kanban column CRUD, reordering, WIP limits |
| `custom-fields.ts` | field-definition CRUD, per-task value writes |
| `automation.ts` | automation-rule CRUD + rule toggling |
| `templates.ts` | task-template CRUD, "create task from template" |
| `saved-views.ts` | Focus saved-view CRUD |
| `notifications.ts` | list/read/mark-all-read, preference updates, device registration |
| `sso.ts` | per-tenant SSO provider config (`getTenantSsoConfig`, `saveTenantSsoAction`) |
| `planner-sync.ts` | link/unlink a project to a Planner plan, manual "sync now" |
| `import.ts` | MS Planner/Excel import (preview + commit, idempotent by `externalId`) |
| `branding.ts` | tenant branding (logo upload/remove, colours, theme) |
| `settings.ts` | user settings (theme, password, locale) |
| `users.ts` | Admin: user CRUD, role changes, temp-password generation |
| `support.ts` | Admin support tools: escalate, co-assign, coaching note |
| `tenants.ts` | BackendAdmin: tenant creation/listing |
| `tenant.ts` | BackendAdmin: tenant switch |
| `db-admin.ts` | BackendAdmin: DB console query execution (read/write/purge), writes `DbAuditLog` |
| `locale.ts` | set active locale cookie |
| `tour.ts` | mark the welcome tour as seen / reset it |

Reporting (`/reports`, `/reports/infographics`, Predictive Insights) reads
directly through `src/lib/reports.ts` / `infographics.ts` / `insights.ts` /
`narrative.ts` from Server Components — there's no separate action or export
endpoint; PDF/image export happens client-side via `jspdf`/`html2canvas`.

## Adding a new endpoint

- Prefer a **Server Action** unless the caller is external (browser fetch from
  a different origin, a webhook, a cron job, or something that needs a real
  HTTP status code) — then add a Route Handler under `src/app/api/`.
- Re-derive the tenant and user from the session/cookie inside the
  action/route; never accept them as a client-supplied parameter.
- Add a zod schema in `src/lib/validation.ts` for any new mutation input.
- If the new query touches a tenant-scoped model, run `npm run audit:tenant`
  before merging — it fails the build on unscoped multi-row Prisma queries.
