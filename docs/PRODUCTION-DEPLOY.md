# Production-Deploy — Coast-Shield-VPS

Schritt-für-Schritt-Anleitung für **zwei** Apps auf dem Coast-Shield-VPS
(`13.140.146.101`):

- **Task-Tracker** → `tasks.coastshield.net` (Next.js + PostgreSQL, Docker) — Abschnitte 0–6
- **OBJ-FSM** → `fsm.coastshield.net` (statische Vite-PWA, von Caddy ausgeliefert) — Abschnitt 7

Beide laufen hinter **Caddy** (Auto-SSL). Du setzt **2 DNS-Einträge** (Abschnitt 0).

| | |
|---|---|
| **Server** | Contabo VPS, `root@13.140.146.101` (bezahlt bis 31.12.2026) |
| **Domain** | `tasks.coastshield.net` |
| **Datenbank** | PostgreSQL (dedizierte DB `tasktracker` auf der bestehenden Coast-Shield-Postgres) |
| **Reverse-Proxy / TLS** | Caddy (Auto-SSL via Let's Encrypt) |
| **Image** | Multi-stage Next.js standalone, baut auf dem VPS aus dem Repo |

Was sich gegenüber Local geändert hat:

- **SQLite → PostgreSQL** (`prisma/schema.prisma` `provider = "postgresql"`,
  frische Postgres-Init-Migration unter `prisma/migrations/`).
- **`next.config.mjs`**: `output: "standalone"` (kleines Runtime-Image), PWA bleibt
  in Production aktiv.
- **`Dockerfile`** (3 Stages) + **`docker-entrypoint.sh`** (führt beim Boot
  automatisch `prisma migrate deploy` aus) + **`.dockerignore`**.
- Infra-Vorlagen unter **`infra/`** (Compose-Service, Caddy-Block, Env, Deploy-Skript).

> ✅ Lokal verifiziert: Postgres-Migration, Docker-Build, Migrate-on-Boot aus
> leerer DB, App-Serving (Login `200`, PWA-Manifest `200`, `sw.js` `200`) und der
> Seed (4 User / 34 Tasks / 3 Projekte / 3 Teams).

---

## 0. DNS einstellen (zuerst — Cloudflare braucht Vorlauf)

In **Cloudflare** (Zone `coastshield.net`) **zwei** Records anlegen:

| Type | Name    | Content          | Proxy-Status               | TTL  | Für              |
|------|---------|------------------|----------------------------|------|------------------|
| `A`  | `tasks` | `13.140.146.101` | **DNS only** (graue Wolke) | Auto | Task-Tracker     |
| `A`  | `fsm`   | `13.140.146.101` | **DNS only** (graue Wolke) | Auto | OBJ-FSM (static) |

> ⚠️ **Wichtig: NICHT „Proxied" (orange Wolke).** Caddy holt die Let's-Encrypt-
> Zertifikate selbst per HTTP-01-Challenge. Hinter dem Cloudflare-Proxy würde das
> beim ersten Mal scheitern. Bei beiden „DNS only" wählen. (Optional später auf
> Proxied + Cloudflare-Origin-Cert umstellen — nicht nötig.)

Prüfen, dass beide aufgelöst werden:

```bash
dig +short tasks.coastshield.net    # muss 13.140.146.101 zeigen
dig +short fsm.coastshield.net      # muss 13.140.146.101 zeigen
```

---

## 1. Auf den VPS & Repo bereitstellen

```bash
ssh root@13.140.146.101

# Repo dorthin klonen, wo die Compose-build-context hinzeigt:
mkdir -p /home/marisight/apps
git clone https://github.com/<your-org>/task-tracker.git /home/marisight/apps/task-tracker
cd /home/marisight/apps/task-tracker
git checkout feat/production-deploy-coastshield-vps   # bzw. main nach dem Merge
```

---

## 2. Datenbank anlegen (bestehende Postgres)

Postgres-Container-Namen finden (`docker ps | grep postgres`), dann:

```bash
# Namen anpassen:  <postgres-container>
docker exec -it <postgres-container> psql -U postgres -c \
  "CREATE USER tasktracker WITH PASSWORD 'EIN-STARKES-PASSWORT';"
docker exec -it <postgres-container> psql -U postgres -c \
  "CREATE DATABASE tasktracker OWNER tasktracker;"
```

> Alternativ eine komplett neue Postgres-Instanz — dann den Service in der
> Compose-Datei ergänzen. Empfohlen ist aber die bestehende Postgres + eigene DB.

---

## 3. Env-Datei + Infra-Dateien platzieren

```bash
cd /home/marisight/marisight/infra/prod          # Coast-Shield prod-Stack

# Env aus der Vorlage erzeugen und ausfüllen:
cp /home/marisight/apps/task-tracker/infra/.env.task-tracker.example .env.task-tracker
nano .env.task-tracker
#   - DATABASE_URL  → User/Passwort/Host(=Postgres-Service-Name)/DB eintragen
#   - SESSION_SECRET → `openssl rand -hex 32`
#   - ADMIN_PASSWORD / DEMO_PASSWORD setzen
```

**Compose-Service** in den prod-Stack mergen — den `task-tracker`-Service-Block aus
`infra/docker-compose.task-tracker.yml` in `docker-compose.prod.yml` kopieren
(inkl. `volumes:` + `networks:`). Dabei die mit `# CONFIRM:` markierten Werte prüfen:

```bash
docker network ls          # echte Netz-Namen (proxy/data) ablesen
docker compose ps          # echten Postgres-Service-Namen ablesen
```

**Caddy-Block** anhängen — Inhalt von `infra/Caddyfile.task-tracker` in den
Coast-Shield-`Caddyfile` einfügen.

---

## 4. Deploy

Bequem über das mitgelieferte Skript (auf dem VPS):

```bash
cd /home/marisight/marisight/infra/prod
APP_DIR=/home/marisight/apps/task-tracker \
COMPOSE_DIR=$PWD COMPOSE_FILE=docker-compose.prod.yml \
bash /home/marisight/apps/task-tracker/infra/deploy-tasks.sh --seed
```

`--seed` **nur beim allerersten Deploy** (der Seed leert Tasks/Projekte/Teams und
legt sie neu an). Bei späteren Redeploys ohne `--seed`.

Oder manuell:

```bash
# 1) Image bauen
docker build -t task-tracker:latest /home/marisight/apps/task-tracker
# 2) Service starten (migrate deploy läuft automatisch im Container-Boot)
docker compose -f docker-compose.prod.yml up -d task-tracker
# 3) Caddy neu laden (neuer Site-Block)
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
# 4) Einmalig: Seed
docker compose -f docker-compose.prod.yml exec -T task-tracker npx prisma db seed
```

---

## 5. Verifizieren (SSL- + Health-Check)

```bash
# Zertifikat / HTTPS
curl -sI https://tasks.coastshield.net/login | head -n 5
#   → HTTP/2 200  und ein gültiges Let's-Encrypt-Zertifikat

# App + DB
curl -s -o /dev/null -w "login: %{http_code}\n"  https://tasks.coastshield.net/login
curl -s -o /dev/null -w "home:  %{http_code}\n"  https://tasks.coastshield.net/
#   → login: 200,  home: 307 (Redirect auf /login, weil nicht eingeloggt — korrekt)

# Container-Status & Logs
docker compose -f docker-compose.prod.yml ps task-tracker
docker compose -f docker-compose.prod.yml logs --tail=40 task-tracker
#   → "All migrations have been successfully applied." + "✓ Ready"
```

**Im Browser:** `https://tasks.coastshield.net` öffnen → Login-Seite, Vorhängeschloss
(gültiges TLS). Mit `admin` / `<ADMIN_PASSWORD>` einloggen → das Board zeigt das
**Coast-Shield-Projekt** mit den 24 Tasks + Demo-Daten.

---

## 6. Updates später (Redeploy)

```bash
cd /home/marisight/marisight/infra/prod
bash /home/marisight/apps/task-tracker/infra/deploy-tasks.sh      # ohne --seed!
```

Migrationen werden bei jedem Boot idempotent angewandt. Neue Prisma-Migrationen
einfach mit committen — `migrate deploy` zieht sie automatisch.

---

## 7. OBJ-FSM (static PWA) → `fsm.coastshield.net`

OBJ-FSM (Repo `C:\Users\sapb1\source\OBJ-FSM`) ist eine **rein statische** Vite-PWA
(React, kein Server, `base = /`). Caddy liefert die gebauten `dist/`-Dateien aus
einem Host-Verzeichnis `/srv/obj-fsm` aus — **kein eigener Container**.

**Einmalig einrichten (auf dem VPS):**

```bash
ssh root@13.140.146.101
mkdir -p /srv/obj-fsm
```

1. **Caddy-Block** aus `infra/Caddyfile.obj-fsm` an den Coast-Shield-`Caddyfile`
   anhängen (gleiche Datei wie der tasks-Block).
2. **Bind-Mount** zum Caddy-Container hinzufügen — `/srv/obj-fsm:/srv/obj-fsm:ro`
   am `caddy`-Service in `docker-compose.prod.yml`
   (siehe `infra/docker-compose.obj-fsm.override.yml`), dann Caddy neu erstellen:
   ```bash
   docker compose -f docker-compose.prod.yml up -d caddy
   docker exec caddy caddy reload --config /etc/caddy/Caddyfile
   ```

**Deploy / Updates (lokal auf deinem Rechner — Git Bash):**

```bash
# baut OBJ-FSM und synct dist/ → VPS:/srv/obj-fsm (rsync, sonst tar-over-ssh)
bash /c/Users/sapb1/source/Sy/task-tracker/infra/deploy-fsm.sh
```

> Das Skript baut lokal (Vite backt Env beim Build) und braucht denselben
> SSH-Zugang wie `ssh root@13.140.146.101`. `SKIP_BUILD=1` synct nur das
> vorhandene `dist/`. Für spätere Updates einfach erneut ausführen.

**Verifizieren:**

```bash
curl -sI https://fsm.coastshield.net/ | head -n 5          # → HTTP/2 200 + gültiges Cert
curl -s -o /dev/null -w "sw: %{http_code}\n" https://fsm.coastshield.net/sw.js   # → 200
```

Im Browser `https://fsm.coastshield.net` öffnen → FSM-PWA lädt, installierbar
(gültiges TLS, Service-Worker aktiv). Deep-Links / Reloads funktionieren dank
`try_files … /index.html` (SPA-Routing).

---

## Persistenz / Backup

- **Uploads**: Docker-Volume `task_tracker_uploads` (gemountet auf
  `/app/public/uploads`). In die VPS-Backups aufnehmen.
- **Datenbank**: `tasktracker`-DB in die bestehende Postgres-Backup-Routine
  aufnehmen, z. B.:
  ```bash
  docker exec <postgres-container> pg_dump -U tasktracker tasktracker > tasktracker_$(date +%F).sql
  ```

## Troubleshooting

| Symptom | Ursache / Fix |
|---|---|
| Caddy-Cert schlägt fehl | DNS noch „Proxied" → auf **DNS only** stellen; Port 80/443 am VPS offen? |
| `Can't reach database server` | `DATABASE_URL`-Host ≠ Postgres-Service-Name, oder nicht im selben `data`-Netz |
| Caddy „host not found upstream" | `task-tracker` nicht im selben `proxy`-Netz wie Caddy |
| Login schlägt fehl | Seed gelaufen? `... exec -T task-tracker npx prisma db seed` |
| `502` direkt nach Deploy | Container bootet noch (migrate). Logs prüfen, ~20–40 s warten |
| FSM: `404` / leere Seite | Bind-Mount `/srv/obj-fsm` am Caddy-Container fehlt, oder `dist/` nicht hochgeladen |
| FSM: alte Version trotz Deploy | Service-Worker-Cache → Hard-Reload; `sw.js`/`index.html` werden mit `no-cache` ausgeliefert |
