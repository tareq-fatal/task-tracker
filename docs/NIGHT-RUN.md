# Nacht-Run — 2026-07-13 · Mandanten-Löschen-Button

## TL;DR für morgen früh

**Der Button ist im Code korrekt und fertig. Er fehlt auf Prod, weil v3.1 nie auf Prod deployt wurde.** `Ctrl+Shift+R` allein reicht **nicht** — es muss erst deployt werden. Ich (Claude) **konnte nicht deployen**: auf dieser Maschine liegt **kein SSH-Key** für den Prod-VPS (`root@13.140.146.101`), und ein unbeaufsichtigter Nacht-Deploy von 33 Migrationen + einem **destruktiven** Tenant-Hard-Delete auf die Live-DB wäre unverantwortlich gewesen.

## Beweis der Diagnose

`main` (v3.1) ist gemergt, aber Prod läuft weiter v3.0.0. Belegt durch Prod-Probes:

| Route (nur in v3.1) | Prod | Bedeutung |
|---|---|---|
| `/api/openapi.json` | **404** | v3.1 nicht deployt |
| `/gantt` | **404** | v3.1 nicht deployt |
| `/time` | **404** | v3.1 nicht deployt |
| `/admin/mandanten` | 307 → login | Route existiert (schon in v3.0), aber alte UI ohne Button |

→ Kein `git push`, kein CSS-Fix, kein Cache-Bust bringt den Button, solange der **Prod-Container den v3.1-Build nicht ausliefert**.

## Der Button-Code ist verifiziert korrekt

- `src/app/(app)/admin/mandanten/page.tsx` rendert `<DeleteTenantButton>` **pro Tenant-Zeile**, gated durch `can(user.role, "manageTenants")`.
- `manageTenants` = **BackendAdmin** (= Tarek; legacy „SuperAdmin" wird auf BackendAdmin normalisiert). Tarek sieht die Seite und den Button.
- `src/components/delete-tenant-button.tsx`: **roter** Button (`text-rose-600`, Trash2, `data-testid="delete-tenant"`) für jeden **fremden** Tenant; für den **eigenen** Tenant absichtlich grau-disabled (`data-testid="delete-tenant-disabled"`) — man kann seinen eigenen Mandanten nicht löschen.

**⚠️ Ein Punkt zum Prüfen:** Wenn es auf Prod nur **einen** Mandanten (Tareks eigenen) gibt, erscheint post-Deploy nur der **graue disabled** Button (Selbstlösch-Sperre), kein roter. Ein roter Button erscheint nur bei **weiteren** Mandanten. Falls Tarek einen roten Test-Button sehen will: einen zweiten Test-Mandanten anlegen.

## Was zu tun ist (Deploy v3.1 — 1× manuell)

```bash
ssh root@13.140.146.101
cd <task-tracker-repo>          # siehe docs/PRODUCTION-DEPLOY.md
git pull origin main
npm ci && npm run build         # regeneriert PWA-SW mit neuen Hashes → Cache bust automatisch
npx prisma migrate deploy       # 33 Migrationen (NICHT db push)
docker compose up -d --build    # bzw. Service-Neustart je nach Setup
```
Danach Verifikation: `/api/openapi.json`, `/gantt`, `/time` müssen **200/307** statt 404 liefern. Dann auf `/admin/mandanten` mit BackendAdmin → roter Löschen-Button (bei ≥2 Mandanten). Browser: `Ctrl+Shift+R` (PWA-SW `skipWaiting`+`cleanupOutdatedCaches` invalidiert den Cache ohnehin beim neuen Build).

## Cache-Bust — schon eingebaut

next-pwa generiert `public/sw.js` bei jedem Build neu (content-hashed Assets, `self.skipWaiting()`, `cleanupOutdatedCaches()`). Ein separater manueller Cache-Version-Bump ist **nicht nötig** — der neue Build erledigt das. Zusätzlich Version-String `3.0.0 → 3.1.0` gesetzt (openapi.ts, Sentry-Release).

## Was ich in dieser Nacht sicher erledigt habe

- Diagnose + Root-Cause (oben), Button-/Rollen-Code verifiziert (kein Bug).
- Version-Bump 3.1.0.
- **Screenshot-Beweis:** [`docs/proof/mandanten-delete-button.png`](./proof/mandanten-delete-button.png) — lokal gegen ein frisches Postgres (v3.1-Build, geseedet) mit BackendAdmin-Login erzeugt. Zeigt `/admin/mandanten` mit **3 roten Löschen-Buttons** (Default, Tarek, Marine) + **1 grauem disabled** (Objektus = eigener Tenant). ⇒ Der Button ist im v3.1-Code **sichtbar & korrekt** — er fehlt auf Prod NUR wegen des fehlenden Deploys.
- **Bonus-Beweis:** Alle **33 Migrationen** liefen mit `prisma migrate deploy` **fehlerfrei** gegen eine frische DB → die Migrations-Kette ist deploy-ready (kein Drift-Risiko beim Prod-Deploy).

## Nebenbei-Status (die „falls Zeit"-Punkte)

- **global-search-Konflikt** → ✅ bereits gelöst & auf main (heute früher, app-shell + fuse.js).
- **analytics-Konflikt** → ✅ bereits gelöst & auf main (tasks.ts/sprints.ts/layout Union).
- **Attachment-Upload-Fix** → ✅ bereits gemergt (`claude/attachment-fix`, PR#4).
- **realtime-updates-Konflikt** → ⏸️ **bewusst NICHT** nachts erzwungen. 5-Datei-Kernkonflikt (tasks.ts, layout, app-shell, kanban-board, i18n); eine hastige Auflösung könnte das Board für alle User brechen. Braucht dedizierten Rebase mit Feature-Kontext — kein guter Nacht-Alleingang.
- **Task-Count-Trennung (Primary vs Co-Assignee)** → ❓ **unterspezifiziert.** Multi-Assignee (#13) existiert, aber *wo* die getrennten Counts erscheinen sollen (Dashboard? Focus-Tab? Nav-Badge?) ist unklar. Ich rate das nachts nicht — bitte kurz sagen wo, dann 1 gezielter Commit. (Kein spekulativer Umbau an geteilten Zähler-Views.)

## Warum kein Auto-Deploy in dieser Nacht

Kein Prod-SSH-Zugang auf dieser Maschine + Prinzip: **destruktives Feature + 33 ungetestete Live-Migrationen unbeaufsichtigt nachts = zu riskant.** Der Deploy braucht 2 Minuten mit Prod-Zugang und sollte beaufsichtigt laufen (Tarek).
