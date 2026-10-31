# Task Tracker — on-premise installation package (`task-tracker-onprem`)

Everything needed to install Task Tracker on your own server — from a USB
stick or a single file, and if necessary **without any internet connection**:
the data never leaves your server.

**Please read first:** [`NUTZUNGSHINWEISE.md`](NUTZUNGSHINWEISE.md) — terms of
use (German, English, Arabic) and the support contact.

**Illustrated step-by-step guides (2 pages each):**
[`docs/INSTALL_DE.pdf`](docs/INSTALL_DE.pdf) (Deutsch) ·
[`docs/INSTALL_EN.pdf`](docs/INSTALL_EN.pdf) (English) ·
[`docs/INSTALL_AR.pdf`](docs/INSTALL_AR.pdf) (العربية). This README is the
technical reference. Every possible outside connection of the app is listed in
[`docs/OFFLINE.md`](docs/OFFLINE.md).

---

## Quick start

```bash
# One-file installer (offline package): asks for name, logo, language, address.
sudo bash task-tracker-onprem-1.2.0.run

# The same without questions:
sudo bash task-tracker-onprem-1.2.0.run -- --app-name "Harbour Tasks" --locale ar --yes

# From the unpacked folder (offline package), HTTPS from the server's own CA:
sudo ./install.sh --offline --tls internal --app-name "Harbour Tasks" --locale ar

# Server with internet and a public domain (online package, Let's Encrypt):
sudo ./install.sh --tls domain --domain tasks.example.com
```

The installer asks only what it cannot work out itself, generates every secret
itself, and ends with a **one-time invite link** for the superuser — there is no
default account and no generated password. Typical run time is 3–5 minutes
offline, 10–20 minutes online.

## One-file installer (`.run`)

`task-tracker-onprem-<VERSION>.run` is the whole package in one file: a short
bash header followed by the package as `tar.gz`. No extra tool is needed on the
server (only bash, tar, gzip, sha256sum — all part of Ubuntu).

```bash
sha256sum -c task-tracker-onprem-1.2.0.run.sha256      # optional: check the copy
sudo bash task-tracker-onprem-1.2.0.run                # install
```

What the header does, in this order:

1. refuses to run without root (`sudo bash …run`), warns on anything other than
   Ubuntu 22.04 / 24.04, checks for ≥ 2 GB free in `/var/tmp`;
2. checks the **SHA-256** of the embedded package against the value recorded in
   the header — a damaged or incomplete copy is rejected before anything is
   unpacked;
3. unpacks into a private directory `/var/tmp/task-tracker-onprem-<VERSION>.XXXXXX`
   (mode 700; removed again if anything fails);
4. if Task Tracker is **already installed**, offers an **update** instead
   (`update.sh --from`, with backup and automatic rollback);
5. otherwise asks four questions, each with a suggestion — **name** of the
   interface, **logo** (optional), **language** (ar/de/en, default de) and the
   **address** (host name, optional; IP address, detected automatically) — and
   runs `install.sh --offline --tls internal … --yes`;
6. afterwards the unpacked copy is **deleted** (install.sh copied everything it
   needs to `/opt/task-tracker`, the images are loaded into Docker). Keep the
   `.run` file — it is the package. `--keep` keeps the unpacked copy in
   `/opt/task-tracker-installer-<VERSION>` instead.

Options of the `.run` file:

| Option | Effect |
| --- | --- |
| `-- <install.sh options>` | no questions; the options are passed to `install.sh` (`--offline` is added for an offline package) |
| `--check` | only verify the checksum (no root needed) |
| `--extract-only <dir>` | only unpack (no root needed) |
| `--keep` | keep the unpacked package in `/opt/task-tracker-installer-<VERSION>` |
| `--help` | usage |

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
packages of a package built with `--debs`, matching the Ubuntu release).
Nothing else is required — no Node.js, no PostgreSQL, no web server on the host.

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
| `/opt/task-tracker/NUTZUNGSHINWEISE.md`     | terms of use                                |
| `/opt/task-tracker/ca/task-tracker-root-ca.crt` | root certificate to import (`--tls internal`) |
| `/var/backups/task-tracker/`                | backups, one folder per run (mode 700)      |
| docker volume `task-tracker_pg_data`        | the database                                |
| docker volume `task-tracker_uploads`        | attachments, voice notes, logos (`/app/var/uploads`) |
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
`tracker.example.local`, must resolve to the server via your DNS or the
devices' hosts file) and/or `--ip` (repeatable / comma-separated; detected
automatically when neither is given):

```bash
sudo ./install.sh --offline --tls internal --host tracker.example.local --ip 192.168.1.10
```

No ACME, no OCSP, nothing leaves the server: the Caddyfile sets `local_certs`,
`tls internal`, `ocsp_stapling off`, `skip_install_trust` and
`auto_https disable_redirects` (port 80 has its own block: it serves
`/ca.crt` and redirects everything else to HTTPS). `default_sni` is set to the
first IP, because clients connecting by IP send no SNI and, behind Docker's
port mapping, Caddy cannot see the host's IP either.

Caddy creates the CA on its first start inside the `caddy_data` volume.
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

## Invite link instead of a password

The package and its images contain **no accounts, passwords, keys or tokens**.
The superuser (role `BackendAdmin`, shown as "Superuser") is created only on
your server, by `lib/bootstrap-admin.cjs` inside the app container, exactly the
way the app's own user administration does it:

- password hash of a random secret nobody ever sees (no login possible yet);
- an invite: token = `randomBytes(32).toString("base64url")`, only its SHA-256
  is stored, valid for `--invite-hours` (default 72);
- the link `TT_PUBLIC_URL/einladung/<token>` is printed **once** and written to
  `ACCESS.txt` (mode 600) together with its expiry. It works **once**: whoever
  opens it chooses the password and is logged in.

The suggested e-mail is `admin@<host>` (`--email` to change it), the login name
`admin` (`--admin-user`). Re-running `install.sh` never touches an existing
superuser and issues no new link (`--new-invite` does). Expired or lost link,
or any user locked out:

```bash
sudo /opt/task-tracker/invite.sh                # the superuser
sudo /opt/task-tracker/invite.sh --user layla   # any existing user
```

`--admin-password <pw>` still exists as an explicit exception; the password is
then never echoed or stored.

The workspace: `--tenant-name` (default: the interface name). The empty
placeholder workspace of a fresh database is **renamed** into it, so the
instance has exactly one workspace. Re-runs keep that workspace
(`TT_TENANT_NAME` in `.env`).

## Name at runtime

The name shown in the interface is a **runtime** setting — the images contain
no name:

- `install.sh --app-name "Harbour Tasks"` (or the first question of the `.run`
  file) writes `APP_NAME=Harbour Tasks` to `/opt/task-tracker/.env`;
- change it any time: edit `APP_NAME` in `.env`, then `sudo ./update.sh --restart`;
- empty, or exactly `Task Tracker`, = the default name of each language
  ("Task Tracker", Arabic "متعقب المهام");
- it is used everywhere: page titles, login page, menus, invite page, e-mails
  (`EMAIL_FROM` default `"<name>" <noreply@<host>>`).

Likewise the address: `APP_URL` in `.env` (set by the installer) is used at
runtime for invite links, e-mail links, canonical/OG links and the API
description.

## Logo

- At installation: `install.sh --logo /path/logo.png` (PNG, JPG, WEBP or SVG,
  at most 2 MB; the type is checked by extension and content, SVGs with
  scripts are refused) — or the second question of the `.run` file. The logo
  is copied into the `uploads` volume (`tenants/<workspace>/logo.<ext>`) and set
  for the workspace exactly as an upload in the app would; it shows on the
  login page and in the menu.
- Later: in the app, as superuser, **Settings → Branding** → *Upload logo*;
  colours and themes are set there too.
- The logo lives in the `uploads` volume and is part of every backup.

## Language

`--locale ar|de|en` sets `DEFAULT_LOCALE` (login page for visitors without a
choice, runtime) **and** the superuser's own language (invite page included).
Default `de`. Every user can switch for themselves.

## Offline

`install.sh --offline` (needs an offline package):

- loads `task-tracker:<VERSION>`, `postgres:16-alpine` and `caddy:2-alpine`
  from `images/` and checks all three are present; `.env` gets
  `TT_PULL_POLICY=never` and the stack is started with `up --no-build` —
  nothing is pulled or built;
- sets `TT_OFFLINE=1`: `/api-docs` shows a hint and a link to the local
  `/api/openapi.json` instead of loading Swagger-UI from a CDN;
- generates **no** Web-Push keys (push goes through the browser vendors' push
  services on the internet) and configures no mail service;
- `CHECKPOINT_DISABLE=1` (all installs) stops the Prisma CLI's update check.

Every other outside connection of the app only exists when its service is
configured — full list in [`docs/OFFLINE.md`](docs/OFFLINE.md).

An **offline package contains no source code** — only the pre-built images.
`update.sh --rebuild` is therefore not available on such an installation (it
stops with a hint); updates come from the next package (`update.sh --from …`
or the next `.run` file). `update.sh` on an offline installation updates offline
automatically.

## Day-to-day operation

Run these from `/opt/task-tracker`:

```bash
sudo ./backup.sh                     # back up now
sudo ./backup.sh --to /media/usb     # back up onto a USB stick
sudo ./restore.sh                    # list the available backups
sudo ./restore.sh --from latest --yes
sudo ./update.sh --from /media/usb/task-tracker-onprem-v1.2.0
sudo ./update.sh --restart           # after editing .env (e.g. APP_NAME)
sudo ./update.sh --rollback          # undo the last update (data AND previous version)
sudo ./invite.sh                     # fresh invite link
sudo ./uninstall.sh                  # remove the app, keep the data
sudo ./uninstall.sh --purge          # remove everything
```

A nightly backup at 03:30 is set up by the installer as a systemd timer
(`task-tracker-backup.timer`); 14 backups are kept. Disable it at install time
with `--no-backup-timer`. Backups are **not encrypted** — the backup folder is
root-only (mode 700) and contains every password of the installation; keep
copies (USB) just as safe.

`update.sh` always takes a full backup before it changes anything, and rolls the
old image back automatically if the new version does not come up healthy.

> **Updating a 1.1.x installation:** run the update with the NEW package's
> script — `sudo bash task-tracker-onprem-1.2.0.run` (it offers the update), or
> `sudo /media/usb/task-tracker-onprem-v1.2.0/update.sh --from /media/usb/task-tracker-onprem-v1.2.0`.
> It moves the name from the old image to `APP_NAME` in `.env` and sets
> `TT_ONPREM=1`. (The 1.1.x `update.sh` would reset the name to the default.)

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

## Online vs. offline packages

|                        | online package         | offline package                        |
| ---------------------- | ---------------------- | -------------------------------------- |
| size                   | ~20 MB                 | ~600 MB (+ ~150 MB with `--debs`)      |
| `images/`              | empty                  | app + postgres + caddy images          |
| `app/` (source code)   | yes                    | no (only with `--with-source`)         |
| target server needs    | internet for the build | nothing                                |
| install command        | `sudo ./install.sh`    | `sudo bash …run` or `sudo ./install.sh --offline` |
| instance name          | runtime (`APP_NAME`)   | runtime (`APP_NAME`)                   |
| Web Push               | per installation       | off (or one keypair per package with `--push`) |

## Neutrality and passing on (for the publisher)

The package goes to a third party who runs it on their own server. Therefore:

- **Images are neutral.** `make-bundle.sh --offline` always builds with
  `NEXT_PUBLIC_APP_URL=https://task-tracker.local`, without
  `NEXT_PUBLIC_APP_NAME`, and with `TT_ONPREM_IMAGE=1` (no dev seed scripts,
  no schema comments). Name, address and logo come from the installation.
- **No source code** in offline packages (`--with-source` for emergencies).
- **No accounts, passwords, keys or tokens** in package or image; the superuser
  is created on the target server by invite link. Web Push keys only with
  `--push`.
- `TT_ONPREM=1` (always set by `install.sh`) hides the Android-APK download.
- Internal material (sales documents, the HTML sources and screenshots of the
  guides) is never copied into the package; `make-bundle.sh` checks that.
- `NUTZUNGSHINWEISE.md` (terms of use, support contact) is always included.

## Building a package (for the publisher)

The app source is taken from `git archive <ref>` — **commit first** (or pass
`--ref`), uncommitted changes are not included.

```bash
cd deployment/task-tracker-usb
./make-bundle.sh                                     # online package (with source)
./make-bundle.sh --offline --run                     # offline package + .run file
./make-bundle.sh --offline --debs --run --app-name "Harbour Tasks" --out /media/usb
./make-run.sh ../../dist/task-tracker-onprem-v1.2.0  # .run from an existing folder
```

Output in `--out` (default `<repo>/dist/`): `task-tracker-onprem-v<VERSION>/`,
`task-tracker-onprem-v<VERSION>.tar.gz` (+ `.zip` if `zip` is installed) and with
`--run` `task-tracker-onprem-<VERSION>.run` + `.run.sha256`. `--app-name` is
only the installer's suggestion. Bump `VERSION` before packaging a new release.
Works on Linux and on Windows (Git Bash + Docker Desktop).

`--debs` downloads `docker-ce`, `docker-ce-cli`, `containerd.io`,
`docker-buildx-plugin`, `docker-compose-plugin` **with dependencies** for
**both** Ubuntu releases into `packages/jammy/` and `packages/noble/`. The
architecture is the build machine's — build on x86_64 for x86_64 servers.

`images/build-info.env` records version, commit, build time, the installer's
name suggestion, the image tags and their digests.

Regenerate the PDF guides after changing the installer flow (needs Playwright's
Chromium, or Chrome via `TT_CHROME`):

```bash
node docs/build-pdfs.mjs
```

## Layout

```
task-tracker-onprem-v<VERSION>/
├── NUTZUNGSHINWEISE.md     terms of use (DE/EN/AR), support contact
├── install.sh              installer (online + --offline, TLS modes, --logo)
├── update.sh               update / restart / rollback
├── backup.sh               database + uploads + certificates/CA
├── restore.sh              restore, with a safety copy first
├── invite.sh               fresh one-time invite link
├── uninstall.sh            remove, optionally purge the data
├── docker-compose.yml      the three-service stack
├── VERSION                 package version, also the image tag
├── lib/
│   ├── common.sh           shared shell helpers
│   └── bootstrap-admin.cjs superuser + invite + logo, runs inside the container
├── templates/              .env and Caddyfile templates
├── docs/                   INSTALL_DE.pdf, INSTALL_EN.pdf, INSTALL_AR.pdf, OFFLINE.md
├── images/                 pre-built images (offline packages only)
├── packages/{jammy,noble}/ Docker .deb packages (--debs packages only)
└── app/                    source code (online packages / --with-source only)
```

In the repository the folder also holds `make-bundle.sh`, `make-run.sh` and the
sources of the guides (`docs/build-pdfs.mjs`, `docs/install-*.html`).

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
`docker compose logs caddy`.

**Login does not stick over `http://`.** `COOKIE_SECURE=false` must be in
`.env` (set by `--tls http`), then `sudo ./update.sh --restart`.

**Invite link expired / forgotten password.** `sudo ./invite.sh`
(`--user <name>` for other users).

**The `.run` file says "Checksum MISMATCH".** The copy is damaged or incomplete
— copy it again and compare with `sha256sum -c …run.sha256`.

**Port 80 already in use.** Install with
`sudo ./install.sh --http-port 8080 --https-port 8443`.

**Starting over.** `sudo ./uninstall.sh --purge`, then install again.
The purge offers a final backup first.

**Support:** see [`NUTZUNGSHINWEISE.md`](NUTZUNGSHINWEISE.md).
