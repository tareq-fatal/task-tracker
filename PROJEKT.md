# PROJEKT — Task-Tracker

Projektwissen in kurzer Form. Zu Beginn jeder Sitzung lesen, am Ende aktualisieren.
Stand: 03.11.2026. Keine Zugangsdaten in diese Datei.

## 1. Ziel

Ein eigener Aufgaben-Tracker im Stil von MS Planner (Kanban, Scrum, Gantt usw.), mehrmandantenfähig und arabisch zuerst.
Er ist die zentrale Aufgabenliste für Tarek und alle Claude-Sitzungen (über MCP) und wird auch als eigenes Produkt
angeboten (On-Prem-Paket, eigene Instanz für Objektus).

## 2. Nutzer

- Tarek (Abnahme, Entscheidungen) und die Claude-Sitzungen (Benutzer `claude`, über MCP-Token).
- Mandanten, z. B. `objektus`, `tarek`, `marine` — jeder sieht nur seine Daten; BackendAdmin kann wechseln.
- Kunden mit eigener Instanz (tasks.objektus.app) oder On-Prem-Installation.

## 3. Regeln

- **Ablauf je Aufgabe** (`docs/ABLAUF.md`): 1 umsetzen (`in-progress`) → 2 selbst testen (`self-test`)
  → 3 Tarek nimmt ab (`to-verify`) → 4 ausliefern (`release`) → `Done`. Erst nach Schritt 3 schließen,
  außer die vier Bedingungen der Ausnahme in TOF-0000 sind erfüllt.
- Neue Aufgaben: Titel `TOF-XXXX — Kurztitel`, immer mit Projekt, höchste Nummer frisch aus der Datenbank holen.
- Nie Zugangsdaten in Aufgaben, Dateien, Commits oder PRs („Zugangsdaten liegen bei Tarek“).
- Mandantentrennung immer serverseitig; der Marine-Mandant sendet nichts an externe Dienste oder KI.
- Mehrere Sitzungen: vor jedem Deploy `git pull --rebase`; fremde Commits nie verwerfen.
- Eigener Branch in einem neuen git worktree; nie den Checkout einer laufenden Sitzung umschalten.
- VPS: Caddyfile nur im eigenen Block ändern, vorher Backup + `caddy validate`; mindestens 5 GB frei lassen.
- Nicht als `root` auf den Server (sperrt die eigene IP aus).
- Übersicht „Was liegt bei Tarek“: TOF-0766 (Projekt Mission Control) bei jeder Tracker-Pflege nachführen.

## 4. Adressen

| Was | Adresse |
|---|---|
| Produktion (Coast Shield) | https://tasks.coastshield.net |
| Objektus-Instanz (getrennt) | https://tasks.objektus.app |
| Test-Instanz | unklar (keine eigene Test-Adresse gefunden) |
| GitHub | https://github.com/tareq-fatal/task-tracker |

## 5. Wie deployen (+ Rückweg)

- **Deploy (von Hand):** `gh workflow run deploy.yml --ref main` — streamt `main` auf den VPS, dort läuft
  `infra/deploy-tasks.sh` (Datenbank-Sicherung vorher, Rollback-Image, Docker-Build, Neustart; Migrationen beim Start).
  Alternativ direkt auf dem VPS: `infra/deploy-tasks.sh` (ohne `--seed`!). Anleitung: `docs/PRODUCTION-DEPLOY.md`.
- **Kein automatisches Deploy:** Ein Merge nach `main` liefert nichts aus. Es gibt keine CI für PRs
  (nur `android.yml` bei Tags/manuell und `deploy.yml` manuell).
- **Rückweg:** auf dem VPS `docker tag task-tracker:rollback task-tracker:latest`, dann den Dienst mit
  `docker compose ... up -d task-tracker` neu starten. Muss eine Migration zurück: die Sicherung von vor dem Deploy
  einspielen (Pfad steht in `.github/workflows/deploy.yml`). Sicherung und Wiederherstellung: `docs/BACKUP-RESTORE.md`.
- **Seed nie auf Produktion** im normalen Deploy — er löscht Aufgaben.

## 6. Aktueller Stand (03.11.2026)

- Version v3.x, läuft auf tasks.coastshield.net; Objektus-Instanz seit 30.10. live.
- On-Prem-Paket mit Ein-Datei-Installer und Anleitung DE/EN/AR fertig (TOF-0794/0795); geheimer Download-Link bis 16.11. (TOF-0796).
- In Arbeit: Projektgedächtnis „Wissen“ im Tracker (TOF-0839), befüllt aus den PROJEKT.md-Dateien (TOF-0837).
- Unklar: ob der laufende Server auf dem Stand von `main` ist — `link_tasks` und `assignee` bei `update_task`
  sind gebaut, fehlen aber in der benutzten Schnittstelle (TOF-0144, TOF-0145).

## 7. Offene Punkte (aus dem Tracker, 03.11.2026)

**Kritisch (P1)**
- TOF-0000 — Wiederaufnahme-Prompt (Regeln für neue Sitzungen) aktuell halten — Claude

**Hoch (P2)**
- TOF-0839 — Epic: KI-Projektgedächtnis „Wissen“ (V1) — Claude
- TOF-0117 — Passwort des Claude-Kontos ändern — Tarek
- TOF-0384 — Passwort-Tresor auf dem Rechner einrichten — Claude

**Mittel (P3)**
- TOF-0145 — Zuständigkeit nachträglich ändern können (Live-Stand prüfen) — Claude
- TOF-0144 — Verknüpfungen über die Schnittstelle setzen (Live-Stand prüfen) — Claude
- TOF-0796 — Download-Link On-Prem-Paket: nach 16.11. Ablauf prüfen, Caddy-Block entfernen — Claude
- TOF-0791 — Objektus-Instanz: Update-Weg aus GitHub, AV-Klärung — Claude
- TOF-0387 — E-Mail-Benachrichtigungen scharf schalten (Abnahme) — Tarek
- TOF-0520 — Token selbst ausstellen, ohne SSH — Claude
- TOF-0361 — Doppelte Aufgaben vermeiden — Claude
- TOF-0146 — Prüf-Status im Haupt-Board zeigen — Claude
- TOF-0115 — Aufgaben-Schlüssel ins Datenmodell — Claude

**Niedrig (P4):** TOF-0840 Wissen V2 (später, Tarek), TOF-0787 Vergleich Zoho One (Tarek), TOF-0118 Fehl-Mandant löschen (Tarek),
TOF-0147 Anheften, TOF-0116 Aufgabentyp änderbar (Claude).

## 8. Wo mehr steht

- `README.md` — Funktionen, Schnellstart
- `CONTRIBUTING.md` — Branches, Commits, PRs
- `docs/PRODUCTION-DEPLOY.md`, `docs/DEPLOY.md`, `docs/BACKUP-RESTORE.md` — Deploy und Sicherung
- `docs/MCP.md`, `docs/ABLAUF.md`, `docs/TRACKER-OHNE-MCP.md` — Arbeiten mit dem Tracker
- `docs/WIEDERAUFNAHME-PROMPT.md` — Start-Prompt für neue Sitzungen (gleich zu TOF-0000)
- `docs/ARCHITECTURE.md`, `docs/MULTI-TENANT-SECURITY.md`, `docs/API-DOCS.md` — Technik
