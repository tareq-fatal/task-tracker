# Architecture

System design reference for developers. For deployment steps see
[DEPLOY.md](DEPLOY.md); for the tenant-isolation model see
[MULTI-TENANT-SECURITY.md](MULTI-TENANT-SECURITY.md); for HTTP/action surface
see [API-DOCS.md](API-DOCS.md).

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 14 (App Router), TypeScript |
| Database | PostgreSQL via Prisma 5 (`prisma/schema.prisma`) |
| Auth | Cookie session (`Session` model), argon2 password hashing (`@node-rs/argon2`) |
| UI | Tailwind + shadcn/ui (Radix primitives), `@dnd-kit` for drag & drop |
| Charts / export | recharts, d3-sankey, jspdf, html2canvas, xlsx |
| PWA | `@ducanh2912/next-pwa`, custom service-worker code in `worker/index.js` |
| Mobile shell | Capacitor 6 (`net.coastshield.tasktracker`, Android) |
| Validation | zod schemas (`src/lib/validation.ts`) |
| Tests | Vitest (unit), Playwright (e2e + a read-only live-prod smoke suite) |

There is no separate backend service — all server logic runs as Next.js Server
Actions and a small number of Route Handlers under `src/app/api/`.

## Folder structure

```
prisma/
  schema.prisma        all models (see "Data model" below)
  migrations/          Prisma migration history
  seed.ts              demo data (tenants, users, tasks, ...)

src/
  app/
    login/             public login page
    logout/            GET route — destroys session, redirects to /login
    (app)/             authenticated area, wrapped by a shared layout that
                        resolves the current user + tenant server-side:
      page.tsx          dashboard
      board/            Kanban board
      list/             sortable list + bulk actions
      views/            Scrum / Calendar / Gantt / Timeline tab switcher
      roadmap/          Gantt-style roadmap by Epic/Project
      tasks/            Focus views (admin) + task detail/edit
      projects/         project list, project board, project workflow config
      sprints/          sprint board
      reports/          KPI dashboard + infographics + insights
      settings/         user settings, branding, integrations
      admin/            users, teams, tasks, activity, automation, custom
                        fields, templates, import, mandanten (tenants), db console
    api/                auth callbacks, push subscription, sync/cron webhooks
    download/           attachment download route (access-checked)
    t/                  SuperAdmin tenant-switch route (`/t/{slug}`)

  actions/              "use server" Server Actions — one file per resource
                        (tasks, projects, teams, sprints, users, tenants, sso,
                        planner-sync, automation, custom-fields, branding, ...)

  components/           React components: `ui/` (shadcn primitives) + feature
                        components (kanban-board, sprint-board, gantt-chart,
                        infographic-view, filter-bar, notification-bell, ...)

  lib/                  framework-agnostic logic + the Prisma client:
    prisma.ts            Prisma client singleton
    auth.ts               session creation/verification, password hashing
    tenant.ts             resolves the active tenant per request; enforces
                        the SuperAdmin-only tenant-switch cookie
    roles.ts              role → capability matrix (`can(role, capability)`)
    task-access.ts         per-task visibility/edit/delete permission checks
    i18n.ts / locale.ts    dictionaries (ar/en/de) + active-locale resolution
    enums.ts               allowed string-enum values (status, priority, ...)
    validation.ts          zod schemas for all mutations
    notifications*.ts      routing, quiet hours, digest, cron reminder logic
    planner-sync*.ts       Microsoft Graph mapping + diff engine
    sso.ts                 SSO provider config + authorize-URL building
    hierarchy.ts / roadmap.ts / scrum.ts / sprints.ts / workflow.ts
                          view-specific business logic
    reports.ts / infographics.ts / insights.ts / narrative.ts
                          analytics + the deterministic "AI insights" text generator

worker/index.js          custom service-worker code (web-push handlers),
                        merged into the generated PWA service worker
scripts/                 icon generator, screenshot helper, APK build,
                        `audit-tenant-scope.mjs` (tenant-isolation static audit)
e2e/                     Playwright tests (feature flows + tenant isolation)
e2e-live/                read-only smoke tests safe to run against production
infra/                   Docker Compose + Caddyfile templates, deploy scripts
                        for the Coast-Shield VPS
```

Most `src/lib/*.ts` files have a co-located `*.test.ts` — business logic
(automation, custom fields, hierarchy, planner sync, notifications routing,
recurrence, roadmap zoom, RBAC, SQL guard, table sort, task links, task
access, views, workflow) is unit-tested directly, independent of the UI.

## Data model

All tenant-scoped models carry a `tenantId` foreign key to `Tenant`, indexed
and filtered on every query (see [MULTI-TENANT-SECURITY.md](MULTI-TENANT-SECURITY.md)).
IDs are `cuid()` strings; enums (`role`, `status`, `priority`, `type`, `locale`, …)
are plain strings validated in `src/lib/enums.ts` — Prisma enums aren't used so
values can evolve without a migration.

**Tenancy & identity**
- `Tenant` — slug, name, white-label branding fields, `themeName`, `ssoDomains`
- `User` — `role` (`SuperAdmin` | `Admin` | `User`), optional `email` (unique per tenant), `passwordHash`, `mustChangePassword`, `locale`, notification/quiet-hours prefs
- `Session` — opaque token, expiry, tied to `User`
- `UserIdentity` — links a `User` to an SSO provider's stable account id
- `TenantAuthProvider` — which SSO providers (`azure-ad`/`google`/`github`/`apple`) are enabled per tenant, and whether auto-provisioning is on

**Work items**
- `Task` — title/description/status/priority, `type` (`Epic`|`Story`|`Task`|`Subtask`|`Bug`) with a self-relation (`parentId`/`children`) for hierarchy, `progress`, `estimatedHours`/`spentHours`/`timerStartedAt`, `recurringRule`/`recurringNextAt`, `scrumColumn`, `workflowColumnId`, optional `sprintId`/`teamId`/`projectId`, `externalId`/`bucket` (Planner import), `escalatedAt`
- `TaskAssignee` — every user assigned to a task; `Task.assignedToUserId` is the mirrored primary ("Hauptkopf")
- `Subtask` — simple checklist items with `done`/`order`
- `TaskLink` — `DependsOn` | `Blocks` | `RelatedTo` | `SubtaskOf` between two tasks
- `TaskComment` + `TaskCommentRead` — comment thread and a per-user "read up to" marker driving the ✓/✓✓ receipts
- `TaskAttachment` — uploaded file metadata (path under `public/uploads`, mime, size)
- `CustomFieldDef` / `CustomFieldValue` — tenant- or project-scoped custom fields
- `AutomationRule` — `triggerType`/`triggerValue` → `actionType`/`actionValue` (e.g. status→Done sets priority→Low)
- `ActivityLog` — per-task event trail (created/status/assigned/priority/comment/due/reopened)

**Projects, teams, workflow**
- `Project` — name/colour/`externalId` (Planner idempotency); has `WorkflowColumn`s, `CustomFieldDef`s, `AutomationRule`s, `Sprint`s, and a `PlannerSync`
- `ProjectMember` — explicit access grant; once a project has ≥1 member, members see *all* of that project's tasks, not just their own
- `Team` / `TeamMember` — cross-project grouping with its own stats
- `Sprint` — per-project sprint/cycle with `status` (`planned`|`active`|`closed`)
- `WorkflowColumn` — custom per-project Kanban columns with `wipLimit`, `isInitial`, `isFinal`

**Notifications**
- `Notification` — per-user, typed (`assigned`|`status`|`comment`|`mention`|`due_soon`|`overdue`|`blocker_resolved`|`recurring`)
- `NotificationPreference` — per-user, per-event-type channel toggles (in-app/web-push/email/native)
- `NotificationDevice` — registered Android/iOS push tokens
- `PushSubscription` — Web Push endpoint + keys

**Integrations & admin**
- `PlannerSync` — one per project, MS Graph plan/group id, `direction` (`pull`|`push`|`two-way`), `deltaLink` for incremental sync, `intervalMin`
- `SavedView` — a user's saved Focus-view filter (view type + optional entity id)
- `TaskTemplate` — reusable task presets with an optional `category`
- `DbAuditLog` — every query run through the SuperAdmin DB console (mode `read`/`write`/`purge`)

## Roles & permissions

Three roles, defined in `src/lib/roles.ts`:

| Role | Scope | Key capabilities |
| --- | --- | --- |
| **BackendAdmin** (stored as `SuperAdmin`) | all tenants | everything Admin can do, plus `manageTenants`, `switchTenant`, `useDbConsole` |
| **Admin** (a tenant's "MandantAdmin") | one tenant | `manageUsers`, `manageTeams`, `manageProjects`, `manageWorkflow`, `viewReports`, `editTenantSettings` |
| **User** | one tenant | task CRUD scoped to what they can see (assigned tasks + tasks in projects they're a member of) |

Permission checks happen server-side in the relevant Server Action and again
in the page/layout (`isAdminRole()`, `can(role, capability)`,
`src/lib/task-access.ts` for per-task edit/delete/link rules) — the client
never enforces authorization on its own.

## Rendering & i18n

Locale is resolved server-side (`src/lib/locale.ts`) from a cookie, and the
whole authenticated layout is wrapped in an `I18nProvider` fed by the
dictionaries in `src/lib/i18n.ts` (`ar`/`en`/`de`). Arabic is RTL and the
default; the UI uses logical CSS properties (`ms`/`me`/`ps`/`pe`/`start`/`end`)
so layouts flip direction without duplicated CSS. Theme (dark/light/system) is
applied via a no-flash inline script before hydration and persisted client-side.

## Background/scheduled work

There's no in-process job queue — recurring work is triggered by external
cron calls to dedicated routes, each guarded by a `SYNC_SECRET` header:

- `/api/sync/planner` — runs the MS Graph Planner pull/push/two-way sync
- `/api/cron/notifications` — sends due-soon/overdue reminders (deduped ~20h per task/type)
- `/api/cron/recurring` — expands recurring tasks (`recurringRule`) into their next instance

See [PLANNER-SYNC.md](PLANNER-SYNC.md) and [NOTIFICATIONS.md](NOTIFICATIONS.md).

## Mobile & offline

The web app is a installable PWA (manifest + service worker + offline shell,
with an in-app "update available" prompt). The Android app
(`net.coastshield.tasktracker`) is a Capacitor shell around the same hosted
PWA (`capacitor.config.ts` points at `https://tasks.coastshield.net` by
default, overridable via `CAP_SERVER_URL`), adding native camera capture for
attachments and FCM push. See [MOBILE-APK.md](MOBILE-APK.md).
