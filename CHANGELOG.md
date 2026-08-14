# Changelog

All notable changes to this project are documented in this file. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **MCP integration for Claude Code** — an agent can now work in the tracker:
  create/update tasks, manage checklist steps, upload attachments and list
  projects. Dependency-free stdio server at `mcp/task-tracker-mcp.mjs`, wired
  up by the committed `.mcp.json`. See [docs/MCP.md](docs/MCP.md)
- **Automatic prompt journaling** — a `UserPromptSubmit` hook
  (`mcp/prompt-log-hook.mjs`) appends every Claude Code prompt to the pinned
  task, so an instruction given in passing is not lost. Silent by design (no
  notifications) and strictly fail-open: it never blocks or delays a prompt
- `POST /api/mcp` — single RPC endpoint behind the MCP server, plus `GET /api/mcp`
  for discovery. Documented in the OpenAPI spec under the new `MCP` tag
- `ApiToken` model — per-user machine tokens (SHA-256-hashed, `read`/`read,write`
  scope, revocable, optionally expiring), bound to one user **and** one tenant
- `npm run mcp:token` — mint, list and revoke those tokens from the CLI

### Security
- The MCP surface reuses the UI's guards rather than re-implementing them:
  tenant isolation (a foreign task answers `404`, never `403`), the creator/
  assignee/admin edit tiers, the admin workflow gate on status changes, and the
  attachment MIME allowlist with the extension derived from the validated type.
  `tenantId` and authorship are always stamped from the token, never accepted
  as parameters. Pinned by `src/lib/mcp/surface.test.ts`

## [v3.0.0] — 2026-07-04 (incl. v3.0.1, v3.0.2 follow-ups)

The v3.0 line consolidates admin-support tooling, multi-assignee tasks,
project-level permissions, theming, and a full Arabic QA pass. 38 tracked
points across Added / Changed / Fixed.

### Added
- Multi-assignee task support — a primary assignee ("Hauptkopf") plus co-assignees, kept visible on cards/filters/reports (#13)
- Admin task-escalation tool with a Critical flag, notification and activity-log entry (#24)
- Admin co-assignee "join task as support" tool (#24)
- Admin coaching-note tool (comment + assignee notification) (#24)
- Admin activity feed at `/admin/activity` with per-user filtering and field-level change tracking (#33)
- `Task.escalatedAt` field and an escalation badge on the task card/detail view (#24)
- Project-level permissions via a `ProjectMember` join model — members of a project see all of its tasks, not just tasks assigned to them (#26)
- Admin "Project Members" panel for adding/removing project members (#26)
- Dark / Light / System theme toggle, persisted per browser, no-flash inline script (#21)
- Minimal user Settings page (theme + password only; language, notifications, push and mobile-download moved to admin-only settings) (#21)
- Task template categories, with admin input and grouping in the template picker (#22)
- Optional user email + generated temporary password when creating a user without an email (#31)
- Roadmap auto-zoom fitting a ~3-year span (caps runaway multi-year stretches) plus 3M/6M/1Y/3Y/Auto zoom presets
- Roadmap visual polish: rounded gradient bars, per-lane colour, priority icons, a "today" marker, milestone diamonds
- Sortable List view with multi-select bulk actions and column sorting
- Bulk status-change and bulk-delete actions, gated per-task by edit access
- List view density toggle (comfortable/compact) and colour-coded due dates
- Predictive Insights panel — trend, velocity forecast, burnout-risk detection, bottleneck ranking, effort-vs-reality analysis
- "AI insights" narrative section with deterministic streak/best-day/trend/forecast copy (no external LLM call)
- Formal BackendAdmin vs. MandantAdmin (tenant Admin) role split, with a backward-compatible data migration
- Distinct "Backend" sidebar section for BackendAdmin, with role badges
- Integration-stubs page (`/settings/integrations`) previewing AI-Assistant, Calendar-Sync, Slack/Teams and Email-to-Task placeholders
- Admin-only project creation (regular users can no longer create projects) (#37)
- APK download link, desktop-only, with a PWA-install affordance for Android and an Add-to-Home-Screen hint for iOS (#38)
- Task-origin badge on the task detail page (👤 self-created vs. 🛡️ assigned-by-admin)
- Roadmap project lanes for non-admins now scoped to their visible projects only (#25)
- Admin "change task creator" action, visible in the activity log (#34)
- Comment read-receipts, Telegram-style (✓ sent / ✓✓ read by all watchers) (#12)
- PWA update prompt — a non-intrusive banner appears when a new service-worker build is available (#40)
- Near-real-time notification bell — ~30s polling plus instant refresh on window focus/tab visibility (#10)

### Changed
- Scrum column "Zu prüfen" (Verify) renamed to "Bewertung" (Rating) across workflows and templates (#27)
- Removed the Operations Focus tab; Focus now shows Alle / Person / Team / Projekt (#28)
- Renamed the `/views` page from "Views" to "Kalender" (Calendar); Gantt/Timeline tabs unchanged (#30)
- Non-admin task visibility widened from "assigned-only" to "all tasks in member projects" (#26)
- Assigned-task view simplified: removed the amber restrictive banner, kept a neutral status control, moved the task-origin note to a muted footnote (#39)
- Task-template creation now writes a `TaskAssignee` row too, keeping the primary-assignee mirror invariant intact (#22)
- Admin-notify system now fans every user change out to all admins with field-level detail (#35)
- Timer shows optimistic local state (instant start/stop) instead of waiting on a server round-trip
- Attachment MIME allow-list broadened to Office formats (DOCX/XLSX/PPTX/DOC/XLS/CSV/TXT/ZIP)
- Attachment size limit raised from 5 MB to 10 MB
- `/admin/tenants` URL redirects to `/admin/mandanten` for consistent naming

### Fixed
- Duplicate "Senden" (Send) button in the comment box; the coaching-note action now reads "Hinweis senden" (#12)
- Arabic terminology/grammar QA pass: corrected task-origin rendering, unified numerals to Western digits, made activity-log verbs consistent, localized remaining hardcoded UI strings
- `assignedToUserId` edits now restricted to the task creator/admin (assignees can no longer reassign) (#36)
- Assigned-task edit form 404s for non-creator/non-admin users; the detail page shows a read-only banner instead (#36)
- Office-format attachments (DOCX/XLSX) no longer rejected as an invalid file type
- Attachment downloads now go through `/download/attachment/[id]` with a `Content-Disposition: attachment` header and an access check
- Attachment delete permission tightened to admin OR the task creator (previously any admin-assigned user could delete)
- Task-link permission tightened to admin-only, except a user may still link two of their own tasks together
- Fixed APK logout: a dedicated `GET /logout` route destroys the session and redirects, working correctly inside the Capacitor WebView
- Mobile bottom navigation no longer hidden behind the system nav bar (`viewport-fit=cover` + safe-area insets)
- Mobile drawer no longer jumps to the top on open (scroll-lock fix)
- Regular-user visibility correctly restricted to assigned tasks where no project membership grants broader access
- Focus page (`/tasks`) now correctly redirects non-admins instead of rendering a partial view
- Server-generated notification titles now respect the recipient's locale (previously hardcoded to German for some event types)
- "Geplante Dauer" (estimated duration) now only shown on the create form; actual/spent hours stay hidden until edit

---

## [v2.1.0] — 2026-07-02
- Richer task cards; new-tenant onboarding auto-switches the admin into the tenant they just created.

## [v2.0.1] — 2026-07-02
- Accessibility pass: eliminated all critical axe violations on the main routes, added an a11y audit gate to CI.

## [v2.0.0] — 2026-07-01
- Read-only production smoke-test suite and route loading skeletons.
- Context-aware "generate infographic" buttons per Focus tab.
- Per-tenant white-label branding (logo, brand colours, themes).
- Cross-tenant isolation hardening for Focus views and admin surfaces, with dedicated security tests.
- Per-user saved views (Linear-style) and a URL-persistent Focus tab-view (Person/Team/Project/Operations/All).
- SuperAdmin tenant-onboarding wizard; formalized the SuperAdmin/TenantAdmin/User capability model.
- Task templates, basic automation rules, and custom fields on tasks.
- Custom per-project workflow columns.
- SuperAdmin DB console (`/admin/db`) and a multi-tenant isolation audit.
- Scrum board (Miro/FigJam-style) and Calendar/Gantt/Timeline views.
- German i18n polish pass (Mandant terminology, formatting, error copy).
- Hid demo credentials from the production login page.

## [v1.0.0] — 2026-06-30
- Initial tracked release: issue hierarchy (Epic/Story/Task/Subtask/Bug), Kanban board, projects, teams, comments, attachments, time tracking, reports, notifications (in-app/web-push/email/native), MS Planner two-way sync, Capacitor Android shell, Arabic/English/German i18n.
