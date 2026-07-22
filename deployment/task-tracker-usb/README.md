# Task Tracker — USB Installation Bundle

Everything needed to install Task Tracker on a customer's own server, from a USB
stick, without us being in the room.

**Illustrated step-by-step guides:** [`docs/INSTALL_DE.pdf`](docs/INSTALL_DE.pdf)
(Deutsch) · [`docs/INSTALL_AR.pdf`](docs/INSTALL_AR.pdf) (العربية). Hand those to
the customer — this README is the technical reference.

---

## Quick start

```bash
sudo ./install.sh              # server has internet
sudo ./install.sh --offline    # server has no internet (needs an offline bundle)
```

The installer asks three questions (domain, e-mail, language), generates every
password itself, and prints the login details at the end. Typical run time is
10–20 minutes online, 3–5 minutes offline.

## Requirements

|            | Minimum                                    |
| ---------- | ------------------------------------------ |
| OS         | Ubuntu 22.04 / 24.04, or Debian 12         |
| CPU        | 2 cores, x86_64 or arm64                   |
| RAM        | 4 GB                                       |
| Disk       | 20 GB free                                 |
| Ports      | 80 and 443 free                            |
| Privileges | root, or a user with `sudo`                |

Docker is installed automatically if it is missing. Nothing else is required —
no Node.js, no PostgreSQL, no web server on the host.

## What gets installed

Three containers on one private Docker network:

```
        internet
            │  :80 / :443
      ┌─────▼──────┐
      │   caddy    │   TLS termination, automatic Let's Encrypt certificate
      └─────┬──────┘
            │  :3000 (internal only)
      ┌─────▼──────┐
      │    app     │   Next.js; applies the DB migrations on every boot
      └─────┬──────┘
            │  :5432 (internal only)
      ┌─────▼──────┐
      │  postgres  │
      └────────────┘
```

Neither the app nor the database is reachable from outside the host — only Caddy
publishes ports.

| Path                                     | What it is                             |
| ---------------------------------------- | -------------------------------------- |
| `/opt/task-tracker/`                      | the installed stack                    |
| `/opt/task-tracker/.env`                  | all configuration + secrets (mode 600) |
| `/opt/task-tracker/ACCESS.txt`            | the login details (mode 600)           |
| `/var/backups/task-tracker/`              | backups, one folder per run            |
| docker volume `task-tracker_pg_data`      | the database                           |
| docker volume `task-tracker_uploads`      | attachments and voice notes            |
| docker volume `task-tracker_caddy_data`   | HTTPS certificates                     |

## Day-to-day operation

Run these from `/opt/task-tracker`:

```bash
sudo ./backup.sh                     # back up now
sudo ./backup.sh --to /media/usb     # back up onto a USB stick
sudo ./restore.sh                    # list the available backups
sudo ./restore.sh --from latest --yes
sudo ./update.sh --from /media/usb/task-tracker-usb-v1.1.0
sudo ./update.sh --restart           # after editing .env
sudo ./update.sh --rollback          # undo the last update
sudo ./uninstall.sh                  # remove the app, keep the data
sudo ./uninstall.sh --purge          # remove everything
```

A nightly backup at 03:30 is set up by the installer as a systemd timer
(`task-tracker-backup.timer`); 14 backups are kept. Disable it at install time
with `--no-backup-timer`.

`update.sh` always takes a full backup before it changes anything, and rolls the
old image back automatically if the new version does not come up healthy.

## Generated secrets

`install.sh` generates all of these on a fresh install and writes them to
`/opt/task-tracker/.env`. Re-running the installer on an existing installation
**reuses** them — regenerating would lock out the existing database and log
every user out.

| Variable                       | What it protects                                  |
| ------------------------------ | ------------------------------------------------- |
| `POSTGRES_PASSWORD`            | the database (32 chars, also used in `DATABASE_URL`) |
| `SESSION_SECRET`               | signs the session cookies (32 bytes hex)          |
| `SYNC_SECRET`                  | the `/api/cron/*` and `/api/sync/*` endpoints     |
| `VAPID_PRIVATE_KEY` + `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push (P-256, RFC 8292) |
| administrator password         | 20 chars, shown once and stored in `ACCESS.txt`   |

> The app has no `JWT_SECRET` and no `ACCESS_CODE_PEPPER` — sessions are
> database-backed cookies signed with `SESSION_SECRET`, and passwords are hashed
> with argon2 (no application-level pepper). `SESSION_SECRET` is the equivalent
> of the "JWT secret" here.

## Language

`install.sh --locale <ar|de|en>` sets two things:

- `DEFAULT_LOCALE` in `.env` — the language the **login page** comes up in for
  anyone who has not picked one yet. Read at runtime, so changing it later only
  needs `sudo ./update.sh --restart`.
- the administrator account's own locale.

Every user can switch language for themselves; their choice always wins.

## Online vs. offline bundles

|                        | online bundle          | offline bundle                    |
| ---------------------- | ---------------------- | --------------------------------- |
| size                   | ~5 MB                  | ~600 MB                           |
| `images/`              | empty                  | pre-built container images        |
| target server needs    | internet for the build | nothing                           |
| install command        | `sudo ./install.sh`    | `sudo ./install.sh --offline`     |
| Web Push keypair       | per installation       | one per bundle (see below)        |

Add `--debs` when building an offline bundle for a host that cannot even reach
an apt mirror; the Docker `.deb` packages then ship in `packages/`.

### Offline caveat: `NEXT_PUBLIC_*` is compiled in

`next build` inlines every `NEXT_PUBLIC_*` value into the JavaScript bundles, so
those cannot be changed by editing `.env` afterwards. Two consequences for
offline bundles, where the image is pre-built by us:

- **Web Push** uses one VAPID keypair per bundle, generated by `make-bundle.sh`
  and recorded in `images/build-info.env`. Everyone installed from the same
  offline bundle shares that public key. Build a per-customer bundle if that is
  not acceptable.
- **`NEXT_PUBLIC_APP_URL`** cannot be the customer's domain, because it is not
  known at build time. It only affects canonical/OG/sitemap links, not how the
  app works. `sudo ./update.sh --rebuild` on a machine with internet fixes it.

Online installs have neither limitation: the image is built on the customer's
server with their own values.

## Building a bundle (for us)

```bash
cd deployment/task-tracker-usb
./make-bundle.sh                       # online bundle
./make-bundle.sh --offline             # + pre-built images
./make-bundle.sh --offline --debs      # + Docker .deb packages
```

Output goes to `dist/task-tracker-usb-v<VERSION>/` plus a matching `.zip`. Copy
the **folder** onto the stick — `install.sh` is meant to be run straight off it.
Bump `VERSION` before packaging a new release.

Regenerate the customer PDFs after changing the installer flow:

```bash
node docs/build-pdfs.mjs
```

## Layout

```
task-tracker-usb/
├── install.sh              one-click installer (online + --offline)
├── update.sh               update / restart / rollback
├── backup.sh               database + uploads + certificates
├── restore.sh              restore, with a safety copy first
├── uninstall.sh            remove, optionally purge the data
├── make-bundle.sh          packaging (ours, not the customer's)
├── docker-compose.yml      the three-service stack
├── VERSION                 bundle version, also the image tag
├── lib/
│   ├── common.sh           shared shell helpers
│   └── bootstrap-admin.cjs creates the first administrator, in the container
├── templates/
│   ├── env.template        rendered to /opt/task-tracker/.env
│   ├── Caddyfile.domain    with a domain → automatic HTTPS
│   └── Caddyfile.local     no domain → plain HTTP on the LAN
├── docs/                   INSTALL_DE.pdf, INSTALL_AR.pdf + their sources
├── images/                 pre-built images (offline bundles only)
└── packages/               Docker .deb packages (--debs bundles only)
```

## Troubleshooting

**The website is not reachable.**
`cd /opt/task-tracker && docker compose ps` — all three services should say
`running`, `app` should say `healthy`. Logs: `docker compose logs -f app`.

**No HTTPS certificate.** Caddy needs the domain to resolve to this server and
ports 80+443 to be open from the internet. Check with
`docker compose logs caddy`. Let's Encrypt rate-limits repeated failures, so fix
DNS first and only then restart.

**Forgotten administrator password.** Everything is in
`/opt/task-tracker/ACCESS.txt` (root only).

**Port 80 already in use.** Install with
`sudo ./install.sh --http-port 8080 --https-port 8443`.

**Starting over.** `sudo ./uninstall.sh --purge`, then `sudo ./install.sh`.
The purge offers a final backup first.
