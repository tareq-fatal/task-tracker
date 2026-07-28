# Backup & Restore — Task Tracker (Coast-Shield-VPS)

Automatisiertes tägliches Backup für **PostgreSQL** (`tasktracker`-DB) und die
**Uploads** (`task_tracker_uploads`-Volume), inkl. Upload zu S3-kompatiblem
Object-Storage (Backblaze B2 oder MinIO), 30-Tage-Retention und
Fehler-Benachrichtigung (Slack / E-Mail).

Betrifft nur **Production** (Postgres auf dem VPS). Lokal in der Entwicklung
läuft SQLite (`prisma/dev.db`) — dafür ist kein Backup-Skript nötig.

---

## 1. Architektur

```
┌─────────────────────┐      pg_dump       ┌──────────────┐
│ Postgres (tasktracker)│ ──────────────────▶│  db.sql.gz   │
└─────────────────────┘                     └──────┬───────┘
                                                    │
┌─────────────────────┐      tar + gzip            │  rclone copy
│ task_tracker_uploads │ ──────────────────▶┌──────▼───────┐     ┌───────────────────────┐
│ (Docker-Volume)      │                     │ uploads.tar.gz│ ──▶│ S3-kompatibler Storage │
└─────────────────────┘                     └───────────────┘     │  (Backblaze B2 / MinIO)│
                                                                    └───────────────────────┘
```

Objekt-Layout im Bucket (Datum-Präfix, damit Retention danach filtern kann):

```
<bucket>/backups/tasktracker/2026-07-05/db.sql.gz
<bucket>/backups/tasktracker/2026-07-05/uploads.tar.gz
<bucket>/backups/tasktracker/2026-07-04/db.sql.gz
...
```

**Skripte** (in `infra/`):

| Datei | Zweck |
|---|---|
| `infra/backup.sh` | Tägliches Backup: Dump + Archiv + Upload + Retention + Fehler-Notify |
| `infra/restore.sh` | Restore einer Datums-Version (oder `latest`) — **destruktiv**, braucht `--yes` |
| `infra/.env.backup.example` | Vorlage für alle Env-Variablen (DB, rclone, Retention, Notify) |
| `infra/systemd/task-tracker-backup.{service,timer}` | Variante A: systemd-Timer auf dem VPS-Host |
| `infra/docker-compose.backup.yml` + `infra/docker/backup-run-loop.sh` | Variante B: Sidecar-Container in Compose |

Für den Uploads-Teil gibt es zwei Betriebsarten (`UPLOADS_SOURCE` in
`.env.backup`):

| `UPLOADS_SOURCE` | Wann verwenden | Voraussetzung |
|---|---|---|
| `docker-volume` (Standard) | `backup.sh` läuft **direkt auf dem VPS-Host** | Docker-CLI + Rechte, um `docker volume inspect task_tracker_uploads` aufzulösen (i. d. R. root/sudo) |
| Pfad, z. B. `/uploads` | `backup.sh` läuft **im Sidecar-Container** (`docker-compose.backup.yml`) | Volume dort read-only gemountet (`task_tracker_uploads:/uploads:ro`) — kein Docker-Socket nötig |

Primärer, empfohlener Weg ist **`docker-volume` auf dem Host** (einfacher,
kein Docker-Socket-Mount in einen Container nötig). Die Sidecar-Variante ist
die Alternative, falls alles innerhalb von Compose bleiben soll.

---

## 2. Object-Storage einrichten

Die Skripte nutzen **rclone**, komplett über Environment-Variablen
konfiguriert (`RCLONE_CONFIG_<REMOTE>_*`) — es wird **keine** `rclone.conf`
mit Secrets auf Platte angelegt. Wähle **eine** der beiden Optionen.

### Option A — Backblaze B2

1. Im B2-Dashboard einen neuen **Bucket** anlegen (z. B. `coastshield-backups`).
2. Unter „App Keys" einen **Application Key** erstellen, der **nur auf diesen
   Bucket** beschränkt ist (Read+Write reicht).
3. In `.env.backup` eintragen:

   ```bash
   RCLONE_REMOTE="backup"
   RCLONE_CONFIG_BACKUP_TYPE="b2"
   RCLONE_CONFIG_BACKUP_ACCOUNT="<key-id>"
   RCLONE_CONFIG_BACKUP_KEY="<application-key>"
   RCLONE_BUCKET="coastshield-backups"
   ```

### Option B — MinIO (oder anderer S3-kompatibler Endpoint)

1. Bucket im MinIO anlegen (z. B. über `mc mb minio/coastshield-backups` oder
   die Web-Console).
2. Access-Key/Secret-Key erzeugen (MinIO-Console → „Access Keys").
3. In `.env.backup` eintragen:

   ```bash
   RCLONE_REMOTE="backup"
   RCLONE_CONFIG_BACKUP_TYPE="s3"
   RCLONE_CONFIG_BACKUP_PROVIDER="Minio"
   RCLONE_CONFIG_BACKUP_ENDPOINT="https://minio.coastshield.net"
   RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID="<access-key>"
   RCLONE_CONFIG_BACKUP_SECRET_ACCESS_KEY="<secret-key>"
   RCLONE_BUCKET="coastshield-backups"
   ```

> Nur **eine** der beiden Optionen aktiv lassen — die jeweils andere in
> `.env.backup` auskommentiert lassen (siehe `.env.backup.example`).

### rclone installieren

Auf dem VPS-Host (für die systemd-Variante):

```bash
apt-get update && apt-get install -y rclone postgresql-client
```

Im Sidecar-Container übernimmt das die `apk add` / `apt install`-Zeile in
`docker-compose.backup.yml` automatisch beim Start.

---

## 3. Env-Datei anlegen

```bash
cd /home/marisight/apps/task-tracker/infra
cp .env.backup.example .env.backup
nano .env.backup
```

Wichtigste Werte:

| Variable | Bedeutung |
|---|---|
| `DATABASE_URL` **oder** `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` | DB-Verbindung (gleiche Credentials wie `infra/.env.task-tracker.example`) |
| `UPLOADS_VOLUME` | Name des Docker-Volumes (Standard: `task_tracker_uploads`) |
| `UPLOADS_SOURCE` | `docker-volume` (Host) oder ein Pfad wie `/uploads` (Sidecar) |
| `RCLONE_REMOTE`, `RCLONE_CONFIG_BACKUP_*` | rclone-Backend, siehe Abschnitt 2 |
| `RCLONE_BUCKET`, `KEY_PREFIX` | Ziel-Bucket + Schlüssel-Präfix im Storage |
| `RETENTION_DAYS` | Wie viele Tage Backups aufbewahrt werden (Standard: 30) |
| `SLACK_WEBHOOK_URL` | Optional — Slack-Incoming-Webhook für Fehler-Alerts |
| `NOTIFY_EMAIL_TO` / `NOTIFY_EMAIL_FROM` | Optional — E-Mail bei Fehlern (braucht lokalen MTA, siehe Abschnitt 7) |

**`.env.backup` niemals committen** — sie enthält DB-Passwort und
Storage-Credentials.

---

## 4. Manuelles Backup ausführen

```bash
cd /home/marisight/apps/task-tracker/infra
set -a && source .env.backup && set +a
./backup.sh --verbose
```

Bei Erfolg wird **keine** Slack-/E-Mail-Nachricht verschickt (bewusst, um
nicht bei jedem erfolgreichen Lauf zu spammen) — `--verbose` zeigt stattdessen
Log-Zeilen mit `✓`. Bei einem Fehler (jeder Schritt bricht das Skript per
`set -euo pipefail` + `trap ... ERR` ab) wird sofort Slack/E-Mail benachrichtigt
und das Skript beendet sich mit Exit-Code ≠ 0.

---

## 5. Automatisierung — Variante A: systemd-Timer (empfohlen)

Läuft täglich um **03:30 Uhr** (UTC, Host-Zeit). `Persistent=true` sorgt dafür,
dass ein wegen VPS-Downtime verpasster Lauf beim nächsten Boot nachgeholt wird.

```bash
ssh root@13.140.146.101

# Units installieren (Pfade in den Units ggf. an den echten APP_DIR anpassen)
cp /home/marisight/apps/task-tracker/infra/systemd/task-tracker-backup.service /etc/systemd/system/
cp /home/marisight/apps/task-tracker/infra/systemd/task-tracker-backup.timer   /etc/systemd/system/

systemctl daemon-reload
systemctl enable --now task-tracker-backup.timer

# Status / nächster Lauf
systemctl list-timers task-tracker-backup.timer
journalctl -u task-tracker-backup.service --since "1 hour ago"

# Manuell einmal anstoßen (ohne auf 03:30 zu warten)
systemctl start task-tracker-backup.service
```

`task-tracker-backup.service` lädt seine Konfiguration über
`EnvironmentFile=` aus `.env.backup` (Pfad in der `.service`-Datei anpassen,
falls der Checkout woanders liegt).

---

## 6. Automatisierung — Variante B: Docker-Compose-Sidecar

Alternative, falls der Zeitplan lieber in Compose statt in systemd leben soll.
Ein kleiner Alpine-Container mit `bash` + `postgresql-client` + `rclone`
(beim Start per `apk add` installiert) führt `infra/backup.sh` über eine
simple Sleep-Loop (`infra/docker/backup-run-loop.sh`) täglich zur in
`BACKUP_TIME` konfigurierten Uhrzeit aus — kein Cron-Daemon im Container nötig.

```bash
cd /home/marisight/apps/task-tracker/infra

# Netzwerk-Namen prüfen (muss mit dem Postgres-Netz übereinstimmen)
docker network ls

# .env.backup muss existieren (siehe Abschnitt 3) und
# UPLOADS_SOURCE=/uploads enthalten (Sidecar liest read-only von dort)

docker compose -f docker-compose.backup.yml --env-file .env.backup up -d

docker compose -f docker-compose.backup.yml logs -f backup
```

Den `backup`-Service bei Bedarf auch in den bestehenden
`docker-compose.prod.yml`-Stack mergen (gleiches Muster wie bei
`docker-compose.task-tracker.yml`, siehe `docs/PRODUCTION-DEPLOY.md` Abschnitt 3).

> Nur **eine** der beiden Varianten (systemd ODER Compose-Sidecar) aktiv
> lassen, sonst laufen zwei Backups parallel.

---

## 7. Fehler-Benachrichtigung einrichten

Beide Kanäle sind unabhängig voneinander optional — leere Variable = Kanal
wird übersprungen. Bei Erfolg wird nie benachrichtigt.

**Slack:**

1. Slack-App mit „Incoming Webhooks" erstellen (oder bestehende App nutzen).
2. Webhook-URL in `.env.backup` als `SLACK_WEBHOOK_URL` eintragen.

**E-Mail:**

`backup.sh` ruft dafür einfach `mail` oder `sendmail` auf — es wird **kein**
SMTP-Client im Skript implementiert. Der Host braucht also einen
funktionierenden lokalen MTA:

```bash
# Einfachste Variante: msmtp als sendmail-Ersatz
apt-get install -y msmtp msmtp-mta
# /etc/msmtprc konfigurieren (Relay-Host, Zugangsdaten des Mailproviders)
```

Danach in `.env.backup`:

```bash
NOTIFY_EMAIL_TO="ops@coastshield.net"
NOTIFY_EMAIL_FROM="task-tracker-backup@coastshield.net"
```

---

## 8. Restore-Walkthrough

**Achtung: destruktiv.** `restore.sh` überschreibt die Ziel-DB bzw. die
Ziel-Uploads. Ohne `--yes` zeigt das Skript nur einen Dry-Run (was es tun
würde) und ändert nichts.

```bash
cd /home/marisight/apps/task-tracker/infra
set -a && source .env.backup && set +a

# 1) Erst als Dry-Run ansehen, was passieren würde:
./restore.sh --date latest

# 2) App anhalten, damit während des Restores nichts reinschreibt:
docker compose -f /home/marisight/marisight/infra/prod/docker-compose.prod.yml stop task-tracker

# 3) Tatsächlicher Restore (DB + Uploads):
./restore.sh --date latest --yes

# ...oder gezielt ein bestimmtes Datum:
./restore.sh --date 2026-07-01 --yes

# ...oder nur einen Teil:
./restore.sh --date latest --yes --db-only
./restore.sh --date latest --yes --uploads-only

# 4) App wieder starten:
docker compose -f /home/marisight/marisight/infra/prod/docker-compose.prod.yml start task-tracker
```

`restore.sh` lädt `db.sql.gz`/`uploads.tar.gz` vom passenden Datums-Ordner via
`rclone copy` herunter, spielt den DB-Dump per `psql` ein (`ON_ERROR_STOP=1`)
und entpackt das Uploads-Archiv in den per `UPLOADS_SOURCE` konfigurierten
Pfad (Volume-Mountpoint oder Sidecar-Pfad) — vorher wird der Zielordner
geleert, damit keine alten Reste liegen bleiben.

---

## 9. Wie die Retention funktioniert

Nach jedem **erfolgreichen** Upload listet `backup.sh` die
Datums-Unterordner unter `<bucket>/<KEY_PREFIX>/` (`rclone lsf --dirs-only`),
berechnet das Cutoff-Datum (`heute - RETENTION_DAYS`, Standard 30 Tage) und
löscht per `rclone purge` jeden Ordner, dessen Datum davor liegt. Lokale
Temp-Dateien (`WORK_DIR`) werden in jedem Fall (Erfolg wie auch nach einem
sauber behandelten Fehler) aufgeräumt.

`RETENTION_DAYS` ist frei konfigurierbar in `.env.backup` — z. B. `RETENTION_DAYS=90`
für ein Quartal Aufbewahrung.

---

## Troubleshooting

| Symptom | Ursache / Fix |
|---|---|
| `rclone not found` | `apt install rclone` (Host) fehlt, oder im Sidecar-Container ist `apk add rclone` fehlgeschlagen — Logs prüfen |
| `pg_dump: error: connection to server ... failed` | `PGHOST`/`DATABASE_URL` falsch, oder Backup läuft nicht im selben Docker-Netz wie Postgres |
| `Could not resolve mountpoint for volume` | `UPLOADS_VOLUME`-Name falsch, oder Skript läuft ohne Docker-Zugriff (Sidecar-Fall) — dann `UPLOADS_SOURCE=/uploads` setzen |
| Upload schlägt fehl (`rclone copy` Fehler) | `RCLONE_CONFIG_BACKUP_*`-Variablen falsch/unvollständig, Bucket existiert nicht, oder Netzwerk/Firewall blockiert den Endpoint |
| Retention löscht nichts | `RETENTION_DAYS` zu hoch, oder es gibt noch keine 30+ Tage alten Ordner — kein Fehler |
| Keine Slack-Nachricht bei Fehler | `SLACK_WEBHOOK_URL` leer/falsch, oder Webhook wurde im Slack-Workspace deaktiviert |
| Keine E-Mail bei Fehler | Kein `mail`/`sendmail` auf dem Host installiert, oder `NOTIFY_EMAIL_TO` leer |
| `restore.sh` bricht mit „No objects found" ab | Falsches `--date`, oder `RCLONE_BUCKET`/`KEY_PREFIX` zeigen auf einen anderen Pfad als beim Backup verwendet |
| systemd-Timer feuert nicht | `systemctl list-timers` prüfen; `systemctl enable --now task-tracker-backup.timer` vergessen? |
| Compose-Sidecar und systemd-Timer laufen beide | Nur eine Variante aktiv lassen — sonst doppelte Backups/Race auf denselben Objekt-Keys |
