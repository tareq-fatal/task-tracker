# Branch-Status-Übersicht

_Stand: 2026-07-05 · main @ `1080704` (comment read-receipts #12)_
_Methodik: `git merge-tree --write-tree origin/main <branch>` (virtueller Merge, read-only) + ahead/behind-Count + Migrations-Scan._

> **Legende** — `aN/bM` = N Commits ahead / M behind main. `merge-tree CLEAN` = **keine Text-Konflikte** gegen den aktuellen main-Tip. Achtung: CLEAN erfasst **keine** semantischen/DB-Konflikte — Branches mit Prisma-Migrationen sind trotz CLEAN als ⚠️ markiert (Dev-DB-Drift-Risiko, siehe Memory).

## Zusammenfassung

| Kategorie | Anzahl |
|---|---|
| 🗑️ Stale / bereits in main (a0-Vorfahren) | 22 |
| ✅ ready-to-merge (clean, additiv, keine Migration) | 14 |
| ⚠️ needs-review (Migration / redundant / cross-cutting / rebase nötig) | 12 |
| ❌ conflicts | 3 |
| **Summe (ohne main)** | **51** |

---

## ✅ ready-to-merge (14)

Sauberer virtueller Merge auf aktuellen main, additiv, **keine Prisma-Migration**. Reihenfolge weitgehend egal; bei überlappenden Dateien (Board/Settings) kann es beim _sequentiellen_ Mergen untereinander zu Konflikten kommen → einzeln mergen und nach jedem Merge kurz bauen.

| Branch | ahead | Umfang | Was |
|---|---|---|---|
| `chore/docker-optimize` | a1 | 12 f | Alpine-Multi-Stage-Image, ~70 % kleiner (bereits in Memory dokumentiert) |
| `docs/openapi-spec` | a1 | 6 f | OpenAPI 3.1 + Swagger-UI `/api-docs` |
| `docs/v3-refresh` | a1 | 9 f | v3.0.0-Doku-Refresh |
| `feat/analytics-umami` | a1 | 10 f | Self-hosted Umami, privacy-friendly |
| `feat/backup-automation` | a1 | 9 f | Postgres+Uploads-Backup (B2/MinIO, systemd/Compose) |
| `feat/bulk-import` | a1 | 8 f | Admin CSV/Excel-Import (Tasks/User/Projekte) |
| `feat/custom-fields` | a1 | 10 f | Per-Projekt-Custom-Fields, DnD-Order, Filter/Sort |
| `feat/realtime-updates` | a1 | 19 f | SSE: Live-Board, Presence, Push, Live-Cursors |
| `feat/sentry-error-tracking` | a1 | 12 f | Sentry server/client/edge |
| `feat/seo-optimization` | a1 | 7 f | Trilinguale Meta, OG-Image, Sitemap/robots, JSON-LD |
| `feat/task-dependencies` | a1 | 15 f | Task-Dependencies, Zyklus-Erkennung, Blocks (0 Migr. — nutzt bestehendes Modell, kurz prüfen) |
| `feat/global-search` | a2 | 9 f | Command-Palette-Suche |
| `feat/keyboard-shortcuts` | a2 | 19 f | Globale Shortcuts + Cheatsheet (`?`) |
| `fix/readonly-hints-subtle` | a1 | 1 f | Tote Read-only-i18n-Strings entfernt (#39, trivial) |

## ⚠️ needs-review (12)

| Branch | ahead/behind | Grund |
|---|---|---|
| `feat/bulk-actions` | a1/b0 | **Migration (Tag/TaskTag)** — liegt lt. Memory schon in geteilter Dev-DB → Drift möglich |
| `feat/gantt-view` | a1/b0 | **Migration (Task.startDate)** — Memory: P3009 blockierte migrate deploy, idempotenter Fix nötig |
| `feat/voice-notes` | a1/b0 | **Migration** — Memory: „nicht mergen"; Migration via `migrate diff` |
| `feat/recurring-tasks` | a2/b0 | **Migration** — aktueller Arbeits-Branch dieser Session, 34 f/1925+; single-source `recurring-schedule.ts` |
| `feat/onboarding-flow` | a3/b0 | **Migration (onboarded-Flag)** |
| `feat/export-pdf-excel` | a2/b0 | **2 Migrationen**, 36 f/4137+ — großer Surface, gründlich reviewen |
| `feat/comment-read-receipts` | a1/b0 | **Redundant** — Feature ist bereits als main-Tip `1080704` (#12) gelandet; Branch = Pre-Squash-Variante → wahrscheinlich löschen |
| `feat/pwa-cache-hardening` | a1/b0 | **Redundant** — #40 bereits via `b3c2d95` in main; Branch = Pre-Squash-Variante → wahrscheinlich löschen |
| `polish/theme-perfection` | a1/b0 | **117 Dateien** cross-cutting — kollidiert beim sequentiellen Mergen mit fast allem, ZULETZT mergen |
| `i18n/complete-rollout` | a9/b0 | **47 Dateien** cross-cutting i18n — nach den Feature-Branches mergen, sonst Re-Konflikte |
| `security/audit-hardening` | a1/b0 | Rate-Limit + CSP/Security-Header + XLSX-Hardening — Middleware/Header cross-cutting, Wechselwirkung mit realtime/SSE prüfen |
| `claude/ci-sandbox-deploy` | a1/b18 | Hinter main → erst rebasen, dann CI-Workflow prüfen |

## ❌ conflicts (3)

| Branch | ahead/behind | Grund |
|---|---|---|
| `feat/v11-time-tracking` | a1/b41 | Alter Base (b41), Text-Konflikt + Migration. Rebasen oder als superseded verwerfen (v11-Reihe ist sonst komplett in main). |
| `claude/notif-realtime-counter` | a2/b18 | Konflikt; **vermutlich superseded** durch main-Notification-Bell (#10, `b3c2d95`). Vor Aufwand: Feature-Delta prüfen. |
| `a11y/wcag-aa-deep` | a1/b57 | Sehr alter Base (b57), Konflikt. Kern-a11y ist bereits über `feat/v11-a11y` in main; Delta neu aufsetzen statt rebasen. |

## 🗑️ Stale / bereits in main (22) — Kandidaten zum Löschen

Alle **a0** (0 Commits ahead → Vorfahr von main, vollständig enthalten/superseded). Ältere v9/v10/v11/v21/v22-Iterationen sowie infra-Branches, die in den v3.0.0-main eingeflossen sind.

```
feat/webhooks-system (a0/b0, identisch mit main)     feat/v11-hierarchy
feat/production-deploy-coastshield-vps               feat/v11-sprints
feat/capacitor-apk                                   feat/v11-scrum-board
feat/planner-sync                                    feat/v11-polish-loading
feat/sso-providers                                   feat/v11-focus-infographic
feat/apk-download-page                               feat/v11-white-label
feat/v10-design-revamp                               feat/v11-roles-tabs
feat/v9-reports-recurring-deps                       feat/v11-saturday-release
feat/v10-notifications                               feat/v22-insights
feat/v11-a11y                                         feat/v21-cards-onboarding
feat/v3-list-bulk                                     feat/v3-backend-admin-role
```

Löschen z. B. mit: `git push origin --delete <branch>` (erst mit dem Owner abstimmen).

---

## Empfohlene Merge-Reihenfolge (wenn grünes Licht)

1. **Stale prunen** (22 Branches) — Rauschen weg.
2. **Redundante schließen**: `comment-read-receipts`, `pwa-cache-hardening` (schon in main).
3. **✅ additive Features** einzeln mergen (Docker, docs, analytics, backup, bulk-import, custom-fields, realtime, sentry, seo, task-deps, global-search, keyboard-shortcuts, readonly-hints) — nach jedem Merge Build.
4. **⚠️ Migrations-Branches** einzeln, **Migrationen sequenziell** (`migrate deploy`, nicht `db push`) — Dev-DB-Drift beachten.
5. **Cross-cutting zuletzt**: `security/audit-hardening` → `i18n/complete-rollout` → `polish/theme-perfection`.
6. **❌ conflicts** einzeln bewerten: meist superseded → verwerfen statt rebasen.
