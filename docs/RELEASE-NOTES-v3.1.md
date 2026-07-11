# Task-Tracker v3.1 — Release Notes

_Integrationsstand: 2026-07-05 · Basis: v3.0.0 (`1080704`) · Ziel-Branch: `main`_

> **Deploy-Status:** Alle folgenden Features sind auf **`main` integriert** (jeder Merge mit `tsc --noEmit` + `next build` + `vitest run` grün). **Prod (tasks.coastshield.net) läuft noch v3.0.0** — ein Push auf `main` deployt **nicht** automatisch (Caddy-Host, manueller Deploy). Siehe „Deploy v3.1" unten.

## ✨ Neue Features (auf main gemergt)

### Produktivität & Aufgaben
- **Task-Dependencies** — Blocks/DependsOn mit Zyklus-Erkennung, „blockiert"-Gruppe im Sprint.
- **Recurring Tasks** — Cron + Presets, End-Bedingungen (nie/Anzahl/bis Datum), Pause/Skip, Timezone-anchored.
- **Gantt-View** — interaktive Gantt-Chart (`/gantt`), `Task.startDate`.
- **Custom Fields** — pro Projekt, Typen (Text/Zahl/Datum/Select/User/Checkbox), Drag-&-Drop-Order, Filter/Sort.
- **Time-Tracking + Reports** — globaler Timer + manuelle Einträge, billable-Flag, Timesheet-Woche, Zeit-Reports (`/time`, `/reports/time`).
- **Bulk-Import** — Admin CSV/Excel-Import für Tasks/User/Projekte.
- **Global Search** — Command-Palette (fuse.js Fuzzy-Suche) über Tasks/Projekte/User/Kommentare.
- **Keyboard-Shortcuts** — globale Shortcuts + Cheatsheet-Modal (`?`).
- **Voice Notes** — Sprachnotizen für Tasks & Kommentare (Aufnahme, Waveform, Speed-Playback, optionale Whisper-Transkription).
- **Export PDF/Excel** — trilinguale PDF- & Excel-Exporte mit Async-Queue (`/api/cron/exports`), inkl. **Webhooks-System** (task/sprint-Events).

### UX & Onboarding
- **Onboarding-Flow** — Welcome-Modal + Tour + Feature-Coachmarks, Restart-Button.
- **Tooltips/Help-System** — trilinguale Hover-Tooltips (`TooltipHelp`), localStorage-Preference.
- **APK Notif-Panel** — One-UI-Style Notification-Panel + Scroll-Progress-Bar (PR#3).
- **Attachment-Fix** — Inline-View für Bilder/PDF + robustes Storage-Error-Handling (PR#4).

### i18n & Notifications
- **Notifications trilingual** — Notif-Titel jetzt in **Empfänger-Locale** (ar/de/en) statt hardcoded Deutsch; Create-Time-Lokalisierung, keine Migration, alte Notifs bleiben lesbar.

### Infra & Betrieb
- **Docker-Optimierung** — Alpine Multi-Stage, ~70 % kleineres Image (1.5 GB → 444 MB).
- **Backup-Automation** — Postgres + Uploads (B2/MinIO, systemd + Compose).
- **Sentry** — Error-Tracking server/client/edge.
- **Analytics (Umami)** — self-hosted, cookie-/PII-frei.
- **SEO** — trilinguale Meta-Tags, OG-Image, Sitemap/robots, JSON-LD.
- **OpenAPI 3.1** — Spec + Swagger-UI (`/api-docs`, `/api/openapi.json`).
- **Delete-Mandanten** — BackendAdmin-only Tenant-Hard-Delete (separate Session).
- **Readonly-Hints-Cleanup**, **Doku-Refresh**.

## 🗄️ Datenbank

**33 Migrationen** liegen jetzt auf `main` (u.a. time_entries, task_start_date, recurring_tasks_advanced, voice_notes, webhooks, export_jobs, user_onboarded_at, time_entry_billable). **Noch nicht auf Prod-DB angewandt** — beim Deploy:

```bash
npx prisma migrate deploy   # NICHT db push (siehe docs zu Dev-DB-Drift)
```

## ⏸️ Zurückgestellt (nicht gemergt)

10 Branches brauchen einen dedizierten Rebase (stale base / Kern-Konflikte) — Details + Gründe in [`docs/MERGE-LOG.md`](./MERGE-LOG.md): `bulk-actions`, `realtime-updates`, `security/audit-hardening`, `i18n/complete-rollout`, `polish/theme-perfection`, `rich-text-editor`, `notif-realtime-counter`, `notifications-upgrade-v2`, `v11-time-tracking`, `ci-sandbox-deploy`.

Außerdem: **22 stale Branches gelöscht** (bereits in main enthalten).

## 📱 APK v3.1

Native-Code ist integriert (Notif-Panel + Scroll PR#3; Camera/NativeInit/Preferences auf `feat/apk-native-polish-v2`). **Der signierte `.apk` konnte in dieser Umgebung nicht gebaut werden** — es fehlen JDK + Android SDK + Gradle. Build auf einer Maschine mit Android-Toolchain:

```bash
npm ci && npm run build
npx cap sync android
cd android && ./gradlew assembleRelease   # → app/build/outputs/apk/release/
```

## 🚀 Deploy v3.1 (manuell, offen)

1. Auf dem Prod-Host: `git pull` (main), `npm ci`, `npm run build`.
2. `npx prisma migrate deploy` (33 Migrationen).
3. Service neu starten (Caddy/Compose). Danach Health-Check:
   `/api/openapi.json`, `/gantt`, `/time` sollten **200/307** statt 404 liefern.

## ✅ Health-Check (2026-07-05, vor Deploy)

Prod v3.0.0 gesund: `/login` 200, alle App-Routen 307 (Auth-Redirect), HSTS aktiv, TLS/Caddy ok. Neue v3.1-Routen erwartungsgemäß 404 (noch nicht deployt).
