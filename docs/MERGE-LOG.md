# Merge-Log — v3.1 Integration auf main

Basis: main @ `1080704` · Start: 2026-07-05 · Methode: `git merge --no-ff origin/<branch>` + `npm run build`-Gate, Push nur bei grünem Build. Kein Deploy.

| # | Branch | Ergebnis | Notiz |
|---|--------|----------|-------|
| 1 | `docs/v3-refresh` | ✅ merged | Build grün, auf main gepusht |
| 2 | `docs/openapi-spec` | ✅ merged | Build grün, auf main gepusht |
| 3 | `fix/readonly-hints-subtle` | ✅ merged | Build grün, gepusht (1 Datei, i18n-Cleanup) |
| 4 | `feat/keyboard-shortcuts` | ✅ merged | Build grün, gepusht |
| 5 | `feat/task-dependencies` | ✅ merged | Build grün, gepusht |
| 6 | `feat/custom-fields` | ✅ merged | Build grün, gepusht |
| 7 | `feat/global-search` | ⚠️ CONFLICT (offen) | app-shell.tsx + i18n.ts + package.json ↔ keyboard-shortcuts (additiv) |
| 8 | `feat/analytics-umami` | ⚠️ CONFLICT (offen) | tasks.ts + sprints.ts ↔ task-deps/custom-fields (Tracking-Calls) |
| 9 | `feat/backup-automation` | ✅ merged | Build grün, gepusht |
| 10 | `feat/sentry-error-tracking` | ✅ merged | Build grün, gepusht |
| 11 | `chore/docker-optimize` | ✅ merged | tsc+build+vitest grün, gepusht, Prod 307 |
| 12 | `feat/realtime-updates` | ❌ CONFLICT | 5 Dateien (tasks.ts, (app)/layout.tsx, app-shell.tsx, kanban-board.tsx, i18n.ts) — substanziell, nicht auto-resolved |
| 13 | `feat/bulk-import` | ✅ merged | tsc+build+vitest grün, gepusht, Prod 307 |
| 14 | `feat/seo-optimization` | ✅ merged | Konflikt .env.example (Union gelöst), tsc+build+vitest grün, gepusht |

## Phase A — Ergebnis (2026-07-05)

**11/14 gemergt + auf main gepusht** (jeweils tsc --noEmit + next build + vitest run grün, Prod-Liveness 307 nach Push):
docs/v3-refresh · docs/openapi-spec · fix/readonly-hints-subtle · feat/keyboard-shortcuts · feat/task-dependencies · feat/custom-fields · feat/backup-automation · feat/sentry-error-tracking · chore/docker-optimize · feat/bulk-import · feat/seo-optimization

**3 echte Konflikte — offen, bewusst NICHT auto-resolved (warten auf Entscheidung):**
- `feat/global-search` — app-shell.tsx, i18n.ts, package.json (↔ keyboard-shortcuts; additiv)
- `feat/analytics-umami` — src/actions/tasks.ts, src/actions/sprints.ts (↔ task-deps/custom-fields)
- `feat/realtime-updates` — tasks.ts, (app)/layout.tsx, app-shell.tsx, kanban-board.tsx, i18n.ts (5 Kern-Dateien, substanziell)

Hinweis: Prod hat **keinen** `/api/health`-Endpoint (404) → Liveness via Root (307 = up).
| 15 | `claude/attachment-fix` (PR#4) | ✅ merged | Bugfix inline-view/storage; Gate grün, gepusht, 307 |
| 16 | `claude/apk-notif-scroll-polish` (PR#3) | ✅ merged | One-UI Notif-Panel + Scroll-Progress; Gate grün, gepusht, 307 |
| 18 | `feat/global-search` | ✅ merged | app-shell-Konflikt gelöst + fuse.js installiert; Gate grün, gepusht |
| 20 | `feat/recurring-tasks` | ✅ merged | Migration; prisma generate + Gate grün, gepusht |
| 21 | `feat/gantt-view` | ✅ merged | Migration(startDate); app-shell-Nav-Konflikt gelöst; Gate grün |
| 22 | `feat/onboarding-flow` | ✅ merged | Migration; restart-tour-Konflikt gelöst (Onboarding-Reset+Tooltip); Gate grün |
| 23 | `feat/bulk-actions` | ⏸️ deferred | Echter Integrations-Konflikt: task-table.tsx/list refaktoriert inkompatibel ggü. custom-fields (Selection-Modell + Filter-UI). Braucht manuelle Integration, nicht gebotcht. |
| 24 | `feat/voice-notes` | ✅ merged | Migration; .env+page.tsx Union-Konflikt gelöst; Gate grün |
| 26 | `feat/time-tracking-reports` | ✅ merged | 2 Migr.; schema(ExportJob-Brace-Fix)+app-shell gelöst; Gate grün |
| 27 | `fix/notifications-trilingual` | ✅ merged | NEU (Tarek-Auftrag): Notif-Titel trilingual in Empfänger-Locale, keine Migration; Gate grün |
