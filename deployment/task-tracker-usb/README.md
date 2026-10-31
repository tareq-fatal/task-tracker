# Task Tracker — on-premise installation package (`task-tracker-onprem`)

Everything needed to install Task Tracker on a customer's own server — from a
USB stick, without us being in the room, and if necessary **without any
internet connection** (e.g. on board / Marine: data never leaves the site).

**Illustrated step-by-step guides (2 pages each):**
[`docs/INSTALL_DE.pdf`](docs/INSTALL_DE.pdf) (Deutsch) ·
[`docs/INSTALL_AR.pdf`](docs/INSTALL_AR.pdf) (العربية). Hand those to the
customer — this README is the technical reference. Every possible outside
connection of the app is listed in [`docs/OFFLINE.md`](docs/OFFLINE.md).

> **This bundle is "Option 1 — self-hosted".** There is also **"Option 2 —
> managed hosting"**, where the customer just gets a login on our VPS (own
> tenant, we run updates/backups/SSL). The two options are described for
> customers in [`docs/CUSTOMER_OPTIONS.md`](docs/CUSTOMER_OPTIONS.md) — sales
> material with prices, kept in the repo and **not** shipped on the stick.

---

## Quick start

```bash
# Server without internet (offline bundle), HTTPS from the server's own CA:
sudo ./install.sh --offline --tls internal --app-name "Coast Shield" --locale ar

# Server with internet and a public domain (Let's Encrypt):
sudo ./install.sh --tls domain --domain tasks.example.com
```

The installer asks only what it cannot work out itself (TLS mode, address,
e-mail, language), generates every secret itself, and ends with a **one-time
invite link** for the superuser — there is no generated password any more.
Typical run time is 10–20 minutes online, 3–5 minutes offline.

## Requirements

|            | Minimum                                    | Recommended          |
| ---------- | ------------------------------------------ | -------------------- |
| OS         | Ubuntu 22.04 / 24.04 (Debian 12 works too) |                      |
| CPU        | 2 cores, x86_64 or arm64                   | 4 cores              |
| RAM        | 4 GB                                       | 8 GB                 |
| Disk       | 20 GB free                                 | 50 GB SSD            |
| Ports      | 80 and 443 free                            |                      |
| Privileges | root, or a user with `sudo`                |                      |

Docker is installed automatically if it is missing (offline: from the `.deb`
packages of a `--debs` bundle, matching the Ubuntu release). Nothing else is
required — no Node.js, no PostgreSQL, no web server on the host.

## What gets installed

Three containers on one private Docker network:

```
        LAN / internet
            │  :80 / :443
      ┌─────▼──────┐
      │   caddy    │   TLS: own local CA | Let's Encrypt | none (see TLS modes)
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

| Path                                       | What it is                                  |
| ------------------------------------------ | ------------------------------------------- |
| `/opt/task-tracker/`                        | the installed stack                         |
| `/opt/task-tracker/.env`                    | all configuration + secrets (mode 600)      |
| `/opt/task-tracker/ACCESS.txt`              | address, login, invite link (mode 600)      |
| `/opt/task-tracker/ca/task-tracker-root-ca.crt` | root certificate to import (`--tls internal`) |
| `/var/backups/task-tracker/`                | backups, one folder per run                 |
| docker volume `task-tracker_pg_data`        | the database                                |
| docker volume `task-tracker_uploads`        | attachments, voice notes, tenant logos      |
| docker volume `task-tracker_caddy_data`     | certificates — and the local CA itself      |

## TLS modes

`install.sh --tls <mode>`; the choice is stored as `TT_TLS_MODE` in `.env` and
kept on every re-run.

| Mode | Certificate | Needs | Address (`TT_PUBLIC_URL`) |
| --- | --- | --- | --- |
| `internal` **(default)** | Caddy's own local CA (`templates/Caddyfile.internal`) | nothing — works offline | `https://<--host>` or `https://<LAN-IP>` |
| `domain` | Let's Encrypt (`templates/Caddyfile.domain`) | internet, public DNS, ports 80+443 reachable | `https://<--domain>` |
| `http` | none (`templates/Caddyfile.local`) | — | `http://<LAN-IP>[:port]` |

**`--tls internal`** — site addresses are `--host` (e.g.
`tracker.marine.local`, must resolve to the server via your DNS or the devices'
hosts file) and/or `--ip` (repeatable / comma-separated; detected automatically
when neither is given):

```bash
sudo ./install.sh --offline --tls internal --host tracker.marine.local --ip 192.168.1.10
```

No ACME, no OCSP, nothing leaves the server: the Caddyfile sets `local_certs`,
`tls internal`, `ocsp_stapling off`, `skip_install_trust` and
`auto_https disable_redirects` (port 80 has its own block: it serves
`/ca.crt` and redirects everything else to HTTPS). `default_sni` is set to the
first IP, because clients connecting by IP send no SNI and, behind Docker's
port mapping, Caddy cannot see the host's IP either.

Caddy creates the CA on its first start inside the `caddy_data` volume
(`/data/caddy/pki/authorities/local/root.crt` in the container).
`install.sh` copies the **root** certificate to
`/opt/task-tracker/ca/task-tracker-root-ca.crt` and prints its SHA-256
fingerprint; it can also be downloaded from `http://<server>/ca.crt`. Import it
once per device:

- **Windows:** double-click → *Install Certificate* → *Local Machine* → *Place
  all certificates in the following store* → *Trusted Root Certification
  Authorities*. Firefox has its own store (Settings → Privacy & Security →
  Certificates → Import).
- **Android:** Settings → Security → Encryption & credentials → Install a
  certificate → *CA certificate*.
- **iOS / iPadOS:** open the `/ca.crt` link in Safari → Allow → Settings →
  *Profile Downloaded* → Install; then Settings → General → About →
  *Certificate Trust Settings* → switch it on.
- **macOS:** double-click → keychain *System* → *Trust: Always Trust*.

The root is valid for 10 years; site certificates are renewed by Caddy
locally. `backup.sh` includes the volume and `restore.sh` re-exports the root.
**If the `caddy_data` volume is lost, a new CA is created and every device
has to import the new root.**

**`--tls http`** sets `COOKIE_SECURE=false` (otherwise the browser never sends
the session cookie over HTTP and login is impossible) and warns loudly: nothing
is encrypted. Only for a closed, trusted LAN.

`COOKIE_SECURE` is a general app setting (`src/lib/cookie-security.ts`):
unset = previous behaviour (secure in production), `true`/`false` force it.
Existing instances do not set it and are unchanged.

## Invite link instead of a password

The superuser (role `BackendAdmin`, shown as "Superuser") is created by
`lib/bootstrap-admin.cjs` inside the app container, exactly the way the app's
own user administration does it (`src/lib/invite.ts`):

- password hash of a random secret nobody ever sees (no login possible yet);
- an `Invite` row: token = `randomBytes(32).toString("base64url")`, only its
  SHA-256 is stored (`tokenHash`), `expiresAt` = now + `--invite-hours`
  (default 72), `createdById` = the superuser;
- the link `TT_PUBLIC_URL/einladung/<token>` is printed **once** and written to
  `ACCESS.txt` (mode 600) together with its expiry. It works **once**: whoever
  opens it chooses the password and is logged in.

Re-running `install.sh` never touches an existing superuser and issues no new
link (`--new-invite` does). Expired or lost link, or any user locked out:

```bash
sudo /opt/task-tracker/invite.sh                # the superuser
sudo /opt/task-tracker/invite.sh --user layla   # any existing user
```

Older open links of that user stop working (`usedAt` is set, nothing is
deleted). `--admin-password <pw>` still exists as an explicit exception; the
password is then never echoed or stored.

The workspace: `--tenant-name` (default: the app name). The multi-tenant
migration seeds an empty placeholder tenant `default`; on a fresh install it is
**renamed** into the requested tenant, so the instance has exactly one
workspace. A `default` tenant that holds data is never touched.

## Name, logo, language

- **Name:** `--app-name "Coast Shield"` → `NEXT_PUBLIC_APP_NAME` (TOF-0791,
  `src/lib/brand.ts`) — shown everywhere instead of "Task Tracker". It is
  compiled in by `next build`: online installs pass it as a build arg; offline
  bundles get it from `make-bundle.sh --offline --app-name "Coast Shield"`
  (recorded as `APP_NAME` in `images/build-info.env`). `install.sh --offline
  --app-name …` warns if it differs from the bundle.
- **Logo, colours:** in the app, as superuser: **Settings → Branding**
  (`/settings/branding`) → *Upload logo*. Stored in the `uploads` volume, so it
  is part of every backup. There is deliberately no installer option for it.
- **Language:** `--locale ar|de|en` sets `DEFAULT_LOCALE` (login page for
  visitors without a choice, runtime — `./update.sh --restart` after a change)
  **and** the superuser's own language (invite page included). Default stays
  `de`. Every user can switch for themselves.

## Offline

`install.sh --offline` (needs an offline bundle):

- loads `task-tracker:<VERSION>`, `postgres:16-alpine` and `caddy:2-alpine`
  from `images/` and checks all three are present; `.env` gets
  `TT_PULL_POLICY=never` (→ `pull_policy` in `docker-compose.yml`) and the
  stack is started with `up --no-build` — nothing is pulled or built;
- sets `TT_OFFLINE=1`: `/api-docs` shows a hint and a link to the local
  `/api/openapi.json` instead of loading Swagger-UI from unpkg.com;
- generates **no** Web-Push keys (push goes through the browser vendors' push
  services on the internet) and configures no mail service;
- `CHECKPOINT_DISABLE=1` (all installs) stops the Prisma CLI's update check.

Every other outside connection of the app only exists when its service is
configured — full list with code locations in [`docs/OFFLINE.md`](docs/OFFLINE.md).

`update.sh` on an offline installation updates offline automatically
(`TT_OFFLINE=1` → images from the new bundle).

## Day-to-day operation

Run these from `/opt/task-tracker`:

```bash
sudo ./backup.sh                     # back up now
sudo ./backup.sh --to /media/usb     # back up onto a USB stick
sudo ./restore.sh                    # list the available backups
sudo ./restore.sh --from latest --yes
sudo ./update.sh --from /media/usb/task-tracker-onprem-v1.1.0
sudo ./update.sh --restart           # after editing .env
sudo ./update.sh --rollback          # undo the last update (data AND previous version)
sudo ./invite.sh                     # fresh invite link
sudo ./uninstall.sh                  # remove the app, keep the data
sudo ./uninstall.sh --purge          # remove everything
```

A nightly backup at 03:30 is set up by the installer as a systemd timer
(`task-tracker-backup.timer`); 14 backups are kept. Disable it at install time
with `--no-backup-timer`.

`update.sh` always takes a full backup before it changes anything, and rolls the
old image back automatically if the new version does not come up healthy.

> **Updating a 1.0.x installation:** the running 1.0 `update.sh` does not know
> `invite.sh` yet. After `update.sh --from …` copy it once:
> `sudo cp /media/usb/task-tracker-onprem-v1.1.0/invite.sh /opt/task-tracker/`
> (or re-run `sudo ./install.sh` from the new bundle — it keeps all data and
> secrets). 1.0 LAN installs are kept as `--tls http` and get `COOKIE_SECURE=false`.

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
| `VAPID_PRIVATE_KEY` + `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push (P-256, RFC 8292) — online installs only |
| superuser invite link          | one-time, 72 h, in `ACCESS.txt` — no password     |

> The app has no `JWT_SECRET` and no `ACCESS_CODE_PEPPER` — sessions are
> database-backed cookies signed with `SESSION_SECRET`, and passwords are hashed
> with argon2 (no application-level pepper). `SESSION_SECRET` is the equivalent
> of the "JWT secret" here.

## Online vs. offline bundles

|                        | online bundle          | offline bundle                         |
| ---------------------- | ---------------------- | -------------------------------------- |
| size                   | ~20 MB                 | ~600 MB (+ ~150 MB with `--debs`)      |
| `images/`              | empty                  | app + postgres + caddy images          |
| target server needs    | internet for the build | nothing                                |
| install command        | `sudo ./install.sh`    | `sudo ./install.sh --offline`          |
| instance name          | `install.sh --app-name`| `make-bundle.sh --app-name`            |
| Web Push               | per installation       | off (or one keypair per bundle with `--push`) |

### Offline caveat: `NEXT_PUBLIC_*` is compiled in

`next build` inlines every `NEXT_PUBLIC_*` value into the JavaScript bundles, so
those cannot be changed by editing `.env` afterwards. For offline bundles, where
the image is pre-built by us:

- **Name** — see above (`--app-name` at bundle time).
- **Web Push** — off by default. `make-bundle.sh --push` bakes one VAPID
  keypair into the image (recorded in `images/build-info.env`) and
  `install.sh --offline --push` uses it; everyone installed from that bundle
  shares the key.
- **`NEXT_PUBLIC_APP_URL`** cannot be the customer's address, because it is not
  known at build time. It only affects canonical/OG/sitemap links, not how the
  app works. Invite links use `TT_PUBLIC_URL` and are always right.

## Building a bundle (for us)

The app source in the bundle is `git archive <ref>` — **commit first** (or pass
`--ref`), uncommitted changes are not included.

```bash
cd deployment/task-tracker-usb
./make-bundle.sh                                           # online bundle
./make-bundle.sh --offline --app-name "Coast Shield"       # + pre-built images
./make-bundle.sh --offline --debs --app-name "Coast Shield" --out /media/usb
```

Output: `task-tracker-onprem-v<VERSION>/` + `task-tracker-onprem-v<VERSION>.tar.gz`
(+ `.zip` if `zip` is installed) in `--out` (default `<repo>/dist/`). Copy the
**folder** onto the stick (or unpack the `.tar.gz` there) — `install.sh` is
meant to be run straight off it. Bump `VERSION` before packaging a new release.

`--debs` downloads `docker-ce`, `docker-ce-cli`, `containerd.io`,
`docker-buildx-plugin`, `docker-compose-plugin` **with dependencies** for
**both** Ubuntu releases, each resolved in a clean `ubuntu:22.04` / `ubuntu:24.04`
container, into `packages/jammy/` and `packages/noble/`. `install.sh` picks the
set matching `VERSION_CODENAME` from `/etc/os-release`. The architecture is the
build machine's — build on x86_64 for x86_64 servers.

`images/build-info.env` records version, commit, build time, `APP_NAME`, the
image tags and their digests.

Regenerate the customer PDFs after changing the installer flow (needs
Playwright's Chromium, or Chrome via `TT_CHROME`):

```bash
node docs/build-pdfs.mjs
```

## Layout

```
task-tracker-usb/                (packaged as task-tracker-onprem-v<VERSION>)
├── install.sh              one-click installer (online + --offline, TLS modes)
├── update.sh               update / restart / rollback
├── backup.sh               database + uploads + certificates/CA
├── restore.sh              restore, with a safety copy first
├── invite.sh               fresh one-time invite link
├── uninstall.sh            remove, optionally purge the data
├── make-bundle.sh          packaging (ours, not the customer's)
├── docker-compose.yml      the three-service stack
├── VERSION                 bundle version, also the image tag
├── lib/
│   ├── common.sh           shared shell helpers
│   └── bootstrap-admin.cjs superuser + invite, runs inside the container
├── templates/
│   ├── env.template        rendered to /opt/task-tracker/.env
│   ├── Caddyfile.internal  --tls internal → own local CA (default)
│   ├── Caddyfile.domain    --tls domain   → Let's Encrypt
│   └── Caddyfile.local     --tls http     → plain HTTP on the LAN
├── docs/                   INSTALL_DE.pdf, INSTALL_AR.pdf, OFFLINE.md + sources
├── images/                 pre-built images (offline bundles only)
└── packages/{jammy,noble}/ Docker .deb packages (--debs bundles only)
```

## Troubleshooting

**The website is not reachable.**
`cd /opt/task-tracker && docker compose ps` — all three services should say
`running`, `app` should say `healthy`. Logs: `docker compose logs -f app`.

**Certificate warning (`--tls internal`).** The root certificate is not
imported on that device (see TLS modes), or the device opened an address that
is not in the certificate (only `--host` and the `--ip` addresses are).
Another address: re-run `sudo ./install.sh --host … --ip …`.

**No HTTPS certificate (`--tls domain`).** Caddy needs the domain to resolve to
this server and ports 80+443 to be open from the internet. Check with
`docker compose logs caddy`. Let's Encrypt rate-limits repeated failures, so fix
DNS first and only then restart.

**Login does not stick over `http://`.** `COOKIE_SECURE=false` must be in
`.env` (set by `--tls http`), then `sudo ./update.sh --restart`.

**Invite link expired / forgotten password.** `sudo ./invite.sh`
(`--user <name>` for other users).

**Port 80 already in use.** Install with
`sudo ./install.sh --http-port 8080 --https-port 8443`.

**Starting over.** `sudo ./uninstall.sh --purge`, then `sudo ./install.sh`.
The purge offers a final backup first.
