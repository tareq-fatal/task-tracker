# Admin Guide

For tenant **Admins** and **BackendAdmins** (super-admins). For the end-user
handbook see [USER-GUIDE.md](USER-GUIDE.md); for setup/config detail behind
each integration, follow the links in each section.

## Roles at a glance

| Role | Scope | Can do |
| --- | --- | --- |
| **BackendAdmin** | every tenant | Everything an Admin can, plus create tenants, switch between tenants, use the DB console |
| **Admin** ("MandantAdmin") | one tenant | Manage users, teams, projects, workflow, custom fields, automation, templates, SSO, Planner sync, branding, reports |
| **User** | one tenant | Task work only — no admin screens |

Role checks happen server-side on every route and action (`src/lib/roles.ts`,
`isAdminRole()`, `can(role, capability)`) — there is no client-only gate to
work around.

## User management (`/admin/users`)

- Create users with a username + password, or **without an email** — the app
  generates a temporary password the user must change on first login.
- Change a user's role, reset their password, or delete them.
- Open a user's detail page for their task list and a performance dashboard
  (completed 7/30/90-day counts, on-time rate, average completion time,
  overdue count, a 30-day productivity chart, top projects).
- **Support tools** (Admin, per-task): escalate a task (flags it Critical +
  notifies), join a task as a co-assignee, or leave a coaching note as a
  comment that notifies the assignee.

## Teams (`/admin/teams`)

Teams are a cross-project grouping — add/remove members, see per-team stats
(total / done / active / overdue). A task can belong to a team and a project
independently.

## Projects & project permissions

- Only Admins can create projects (`/projects` → New Project).
- Each project can define its own **workflow columns** (custom Kanban lanes,
  optional WIP limits, and initial/final markers) under
  `/projects/{id}/workflow`.
- **Project members**: once you add ≥1 member to a project, those members see
  *every* task in that project — not just tasks assigned to them. A project
  with no members keeps the default assigned-only visibility for non-admins.

## Custom fields & automation (`/admin/custom-fields`, `/admin/automation`)

- Custom fields (text/number/select/date/checkbox) can be scoped to one
  project or to the whole tenant, and marked required.
- Automation rules are simple `when <status|priority> becomes <value>` (or
  `when created`) → `set <status|priority> to <value>` triggers, toggleable
  per rule, optionally scoped to one project.

## Task templates (`/admin/templates`)

Templates pre-fill a task's title, description, type, priority, story points
and a subtask checklist. Group templates with a **category** (e.g.
"Engineering", "HR") to keep the picker organized.

## Activity & audit (`/admin/activity`)

A tenant-wide feed of every task-affecting change (created, status, assigned,
priority, comment, due date, reopened), with field-level detail and per-user
filtering. Admin changes to a user's account also notify every other admin.

## Reports & Infographics (`/reports`, `/reports/infographics`)

- **Reports**: burndown, workload, activity heatmap, status/priority
  distribution, filterable by date range.
- **Infographics**: drill-down report cards by User, Team or Project — a
  productivity score plus a deterministic "AI insights" narrative (streaks,
  best day, trend, forecast — generated locally, no external LLM call).
- **Predictive Insights**: velocity forecast, burnout-risk flags, bottleneck
  ranking, effort-vs-reality comparison.

## Branding (`/settings/branding`)

Per-tenant white-label: logo upload, primary/secondary/accent colours, and a
named theme (`ocean-pro`, `sage-modern`, `coral-energy`, `custom`,
`dark-only`, `light-only`).

## Notifications (`/settings` → Notifications, Admin-only)

Configure which channels (in-app, web-push, email, native) are wired up
tenant-wide, and env vars needed for each (VAPID keys, `RESEND_API_KEY`,
`FCM_SERVER_KEY`). Full channel matrix and setup: [NOTIFICATIONS.md](NOTIFICATIONS.md).

## Single sign-on (`/settings` → Single Sign-On, Admin-only)

Enable Microsoft (Azure AD), Google, GitHub or Apple per tenant, map email
domains to your tenant for routing, and choose whether new SSO logins
auto-provision a user. Password login stays available alongside SSO. Full
setup (OAuth app registration, env vars, callback URLs): [SSO-SETUP.md](SSO-SETUP.md).

## MS Planner sync (`/settings` → Planner Sync, Admin-only)

Link a project to an existing MS Planner plan for pull / push / two-way sync
(two-way: Planner wins on conflict). Requires an Azure AD app-only
registration with `Tasks.ReadWrite.All` + `Group.Read.All` and admin consent.
Continuous sync needs an external scheduler calling `/api/sync/planner` with
`SYNC_SECRET`. Full setup: [PLANNER-SYNC.md](PLANNER-SYNC.md).

## Import (`/admin/import`)

Upload an MS Planner or Excel export, preview the task/user/bucket counts and
status/priority breakdown, then commit. Buckets map to statuses, unknown
users are auto-created, and re-importing the same file **updates** existing
rows instead of duplicating them (matched by `externalId`).

---

## BackendAdmin-only

### Tenants (`/admin/mandanten`, `/admin/tenants`)

Create new tenants (name, slug, initial branding) via the onboarding wizard.
Switch your own session into any tenant via the sidebar switcher or
`/t/{slug}` — this only works for BackendAdmin; the tenant cookie is ignored
for everyone else. See [MULTI-TENANT-SECURITY.md](MULTI-TENANT-SECURITY.md)
for exactly how isolation is enforced.

### DB console (`/admin/db`)

Runs an arbitrary SQL query (read, write, or a tenant purge) against the
database. Every query is logged to `DbAuditLog` (user, SQL, mode, row count,
error). **This is a dangerous tool** — a purge deletes all of a tenant's data.
Only use it for support/migration work, and double-check the target tenant
slug before running a purge.

## Mobile (Android APK)

Admins get an in-app APK download link in Settings (desktop browsers only —
mobile visitors see a PWA-install/Add-to-Home-Screen hint instead). See
[MOBILE-APK.md](MOBILE-APK.md) for how the APK is built and distributed.
