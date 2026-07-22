#!/usr/bin/env bash
# =============================================================================
# Task Tracker — one-click installer.
#
#   sudo ./install.sh                 # normal (online) install
#   sudo ./install.sh --offline       # no internet: use the images in images/
#   sudo ./install.sh --help          # all options
#
# What it does, in order:
#   1. checks the machine (OS, RAM, disk, free ports)
#   2. installs Docker if it is missing
#   3. asks for the domain, the admin e-mail and the interface language
#   4. generates every password and secret this instance needs
#   5. copies the stack to /opt/task-tracker and starts it
#   6. applies the database migrations and creates the administrator account
#
# Safe to re-run: an existing installation is detected, its data is left alone
# and the existing administrator password is never reset.
# =============================================================================
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "$BUNDLE_DIR/lib/common.sh"

TT_VERSION_DEFAULT="1.0.0"
DOCKER_INSTALL_URL="https://get.docker.com"

# --- Options ------------------------------------------------------------------
OFFLINE=0
SKIP_DOCKER_INSTALL=0
WITH_BACKUP_TIMER=1
ARG_DOMAIN=""; ARG_EMAIL=""; ARG_ADMIN_USER=""; ARG_ADMIN_PASS=""
ARG_LOCALE=""; ARG_ORG=""
HTTP_PORT="80"; HTTPS_PORT="443"

# Kept for the sudo re-exec below: the parsing loop shifts them all away.
ORIG_ARGS=("$@")

usage() {
  cat <<'EOF'
Task Tracker installer

Usage: sudo ./install.sh [options]

  --offline              Install without internet. Loads the container images
                         from images/ instead of building/pulling them.
  --domain <name>        Public domain, e.g. tasks.example.com. Leave out for a
                         LAN-only install reachable by IP over plain HTTP.
  --email <address>      Administrator e-mail (also used for the Let's Encrypt
                         certificate account).
  --admin-user <name>    Administrator login name.            [default: admin]
  --admin-password <pw>  Administrator password.        [default: generated]
  --org <name>           Organisation / workspace name. [default: Task Tracker]
  --locale <ar|de|en>    Default interface language.              [default: de]
  --http-port <port>     Host port mapped to HTTP.                [default: 80]
  --https-port <port>    Host port mapped to HTTPS.              [default: 443]
  --install-dir <path>   Where to install.        [default: /opt/task-tracker]
  --no-docker-install    Fail instead of installing Docker automatically.
  --no-backup-timer      Do not set up the nightly backup timer.
  --yes                  Never ask; accept every default. For unattended runs.
  -h, --help             Show this help.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --offline) OFFLINE=1; shift ;;
    --domain) ARG_DOMAIN="${2:-}"; shift 2 ;;
    --email) ARG_EMAIL="${2:-}"; shift 2 ;;
    --admin-user) ARG_ADMIN_USER="${2:-}"; shift 2 ;;
    --admin-password) ARG_ADMIN_PASS="${2:-}"; shift 2 ;;
    --org) ARG_ORG="${2:-}"; shift 2 ;;
    --locale) ARG_LOCALE="${2:-}"; shift 2 ;;
    --http-port) HTTP_PORT="${2:-}"; shift 2 ;;
    --https-port) HTTPS_PORT="${2:-}"; shift 2 ;;
    --install-dir) TT_INSTALL_DIR="${2:-}"; shift 2 ;;
    --no-docker-install) SKIP_DOCKER_INSTALL=1; shift ;;
    --no-backup-timer) WITH_BACKUP_TIMER=0; shift ;;
    --yes|-y) TT_ASSUME_YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) err "Unknown option: $1"; usage; exit 1 ;;
  esac
done

require_root ${ORIG_ARGS[@]+"${ORIG_ARGS[@]}"}

printf '%s\n' "$C_BOLD"
cat <<'EOF'
  ┌──────────────────────────────────────────────┐
  │            T A S K   T R A C K E R           │
  │              USB Installation                │
  └──────────────────────────────────────────────┘
EOF
printf '%s' "$C_RESET"
[ "$OFFLINE" = "1" ] && info "Offline mode — nothing will be downloaded."

# =============================================================================
# 1. Preflight
# =============================================================================
step "Checking the machine"

OS_NAME="unknown"; OS_VERSION=""
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_NAME="${ID:-unknown}"; OS_VERSION="${VERSION_ID:-}"
fi
case "$OS_NAME:$OS_VERSION" in
  ubuntu:22.04|ubuntu:24.04|debian:12)
    ok "Operating system: ${PRETTY_NAME:-$OS_NAME $OS_VERSION} (supported)" ;;
  ubuntu:*|debian:*)
    warn "Operating system: ${PRETTY_NAME:-$OS_NAME $OS_VERSION}"
    warn "Tested on Ubuntu 22.04/24.04 and Debian 12. Continuing anyway." ;;
  *)
    warn "Unrecognised operating system: ${PRETTY_NAME:-$OS_NAME}"
    confirm "Continue anyway?" n || die "Aborted." ;;
esac

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ok "Architecture: $ARCH" ;;
  aarch64|arm64) ok "Architecture: $ARCH" ;;
  *) die "Unsupported architecture: $ARCH (need x86_64 or arm64)." ;;
esac

MEM_MB=$(( $(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0) / 1024 ))
if [ "$MEM_MB" -ge 3500 ]; then
  ok "Memory: ${MEM_MB} MB"
else
  warn "Memory: ${MEM_MB} MB — 4 GB is recommended. The app may be slow or get OOM-killed."
  confirm "Continue anyway?" n || die "Aborted."
fi

DISK_GB=$(( $(df -Pk /var/lib 2>/dev/null | awk 'NR==2 {print $4}' || echo 0) / 1024 / 1024 ))
if [ "$DISK_GB" -ge 20 ]; then
  ok "Free disk space: ${DISK_GB} GB"
elif [ "$DISK_GB" -ge 8 ]; then
  warn "Free disk space: ${DISK_GB} GB — 20 GB is recommended."
  confirm "Continue anyway?" y || die "Aborted."
else
  die "Only ${DISK_GB} GB free on /var/lib — need at least 8 GB (20 GB recommended)."
fi

port_busy() {
  local p="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltnH "sport = :$p" 2>/dev/null | grep -q . && return 0
  elif command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | grep -qE "[:.]$p[[:space:]]" && return 0
  fi
  return 1
}
for p in "$HTTP_PORT" "$HTTPS_PORT"; do
  if port_busy "$p"; then
    warn "Port $p is already in use by another program."
    warn "Either stop that program, or re-run with --http-port / --https-port."
    confirm "Continue anyway?" n || die "Aborted."
  fi
done
ok "Ports $HTTP_PORT and $HTTPS_PORT are free"

REINSTALL=0
if [ -f "$TT_INSTALL_DIR/.env" ]; then
  REINSTALL=1
  warn "An installation already exists in $TT_INSTALL_DIR."
  info "Your database, uploads and administrator password will be kept."
  info "To start over from scratch, run ./uninstall.sh first."
  confirm "Update this installation in place?" y || die "Aborted."
fi

# =============================================================================
# 2. Docker
# =============================================================================
step "Checking Docker"

install_docker_offline() {
  local debs=("$BUNDLE_DIR"/packages/*.deb)
  [ -e "${debs[0]}" ] || return 1
  info "Installing Docker from the packages on this stick…"
  DEBIAN_FRONTEND=noninteractive dpkg -i "${debs[@]}" >/dev/null 2>&1 \
    || DEBIAN_FRONTEND=noninteractive apt-get -f install -y >/dev/null 2>&1
  command -v docker >/dev/null 2>&1
}

install_docker_online() {
  local script="/tmp/get-docker-$$.sh"
  info "Downloading the official Docker installer from $DOCKER_INSTALL_URL …"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$DOCKER_INSTALL_URL" -o "$script"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$script" "$DOCKER_INSTALL_URL"
  else
    DEBIAN_FRONTEND=noninteractive apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl ca-certificates
    curl -fsSL "$DOCKER_INSTALL_URL" -o "$script"
  fi
  [ -s "$script" ] || return 1
  info "Running it — this takes 1–3 minutes."
  sh "$script" >/dev/null 2>&1 || { rm -f "$script"; return 1; }
  rm -f "$script"
  command -v docker >/dev/null 2>&1
}

if command -v docker >/dev/null 2>&1; then
  ok "Docker is installed ($(docker --version 2>/dev/null | cut -d, -f1))"
else
  [ "$SKIP_DOCKER_INSTALL" = "1" ] && die "Docker is not installed (and --no-docker-install was given)."
  info "Docker is not installed yet."
  confirm "Install Docker now?" y || die "Docker is required. Aborted."
  if [ "$OFFLINE" = "1" ]; then
    install_docker_offline || die "Offline Docker install failed: no usable .deb files in $BUNDLE_DIR/packages/.
Install Docker manually (apt-get install docker.io docker-compose-v2) and re-run this script."
  else
    install_docker_online || die "Docker installation failed. Install it manually and re-run this script."
  fi
  ok "Docker installed"
fi

# The daemon is not necessarily running yet (fresh install, or a container host).
if ! docker info >/dev/null 2>&1; then
  info "Starting the Docker service…"
  if command -v systemctl >/dev/null 2>&1; then
    systemctl enable --now docker >/dev/null 2>&1 || true
  else
    service docker start >/dev/null 2>&1 || true
  fi
  for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
fi
docker info >/dev/null 2>&1 || die "The Docker daemon is not responding. Check: systemctl status docker"
ok "Docker daemon is running"

resolve_compose || die "Docker Compose is missing. Install the docker-compose-plugin package and re-run."
ok "Docker Compose is available ($DC)"

# =============================================================================
# 3. Configuration
# =============================================================================
step "Configuration"

DOMAIN="$ARG_DOMAIN"
if [ -z "$DOMAIN" ] && [ "$REINSTALL" = "1" ]; then
  DOMAIN="$(env_get TT_DOMAIN || true)"
fi
if [ -z "$DOMAIN" ] && [ "$TT_ASSUME_YES" != "1" ]; then
  echo
  info "If this server has a public domain name (e.g. tasks.example.com) pointing"
  info "at it, enter it now — an HTTPS certificate is then obtained automatically."
  info "Leave it empty for an office/LAN install reachable by IP address."
  ask DOMAIN "Domain name" ""
fi

# A bare IP or 'localhost' cannot get a Let's Encrypt certificate.
USE_TLS=1
if [ -z "$DOMAIN" ] || [ "$DOMAIN" = "localhost" ] \
   || printf '%s' "$DOMAIN" | grep -qE '^[0-9]+(\.[0-9]+){3}$'; then
  USE_TLS=0
  [ -n "$DOMAIN" ] && warn "'$DOMAIN' cannot have a public certificate — installing for plain HTTP."
  DOMAIN=""
elif ! printf '%s' "$DOMAIN" | grep -qE '^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$'; then
  die "'$DOMAIN' is not a valid domain name."
fi

ADMIN_EMAIL="$ARG_EMAIL"
if [ -z "$ADMIN_EMAIL" ] && [ "$REINSTALL" = "1" ]; then
  ADMIN_EMAIL="$(env_get ADMIN_EMAIL || true)"
fi
[ -z "$ADMIN_EMAIL" ] && ask ADMIN_EMAIL "Administrator e-mail" "admin@${DOMAIN:-task-tracker.local}"

ADMIN_USERNAME="${ARG_ADMIN_USER:-}"
[ -z "$ADMIN_USERNAME" ] && [ "$REINSTALL" = "1" ] && ADMIN_USERNAME="$(env_get ADMIN_USERNAME || true)"
[ -z "$ADMIN_USERNAME" ] && ask ADMIN_USERNAME "Administrator login name" "admin"

ORG_NAME="${ARG_ORG:-}"
[ -z "$ORG_NAME" ] && ask ORG_NAME "Organisation name (shown in the app)" "Task Tracker"

LOCALE="${ARG_LOCALE:-}"
if [ -z "$LOCALE" ]; then
  ask LOCALE "Default language — ar (العربية), de (Deutsch) or en (English)" "de"
fi
case "$LOCALE" in ar|de|en) ;; *) warn "Unknown language '$LOCALE' — using 'de'."; LOCALE="de" ;; esac

ADMIN_PASSWORD="${ARG_ADMIN_PASS:-}"
GENERATED_PASSWORD=0
if [ -z "$ADMIN_PASSWORD" ]; then
  ADMIN_PASSWORD="$(rand_password 20)"
  GENERATED_PASSWORD=1
fi

if [ "$USE_TLS" = "1" ]; then
  APP_URL="https://$DOMAIN"
  ok "Address: $APP_URL (certificate obtained automatically)"
else
  APP_URL="http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo localhost)"
  [ "$HTTP_PORT" != "80" ] && APP_URL="$APP_URL:$HTTP_PORT"
  ok "Address: $APP_URL (plain HTTP — LAN install)"
fi

# =============================================================================
# 4. Secrets
# =============================================================================
step "Generating passwords and secrets"

if [ "$REINSTALL" = "1" ]; then
  # Reuse everything — regenerating the DB password would lock out the existing
  # data directory, and a new SESSION_SECRET would log everybody out.
  POSTGRES_PASSWORD="$(env_get POSTGRES_PASSWORD)"
  SESSION_SECRET="$(env_get SESSION_SECRET)"
  SYNC_SECRET="$(env_get SYNC_SECRET)"
  VAPID_PUBLIC_KEY="$(env_get NEXT_PUBLIC_VAPID_PUBLIC_KEY)"
  VAPID_PRIVATE_KEY="$(env_get VAPID_PRIVATE_KEY)"
  ok "Reusing the existing secrets (an update must not invalidate them)"
else
  POSTGRES_PASSWORD="$(rand_password 32)"; ok "Database password"
  SESSION_SECRET="$(rand_hex 32)";         ok "Session secret"
  SYNC_SECRET="$(rand_hex 32)";            ok "Sync/cron secret"
  if [ "$OFFLINE" = "1" ] && [ -f "$BUNDLE_DIR/images/build-info.env" ]; then
    # The public half is compiled into the pre-built image, so the private half
    # has to be the one it was generated with.
    VAPID_PUBLIC_KEY="$(sed -n 's/^VAPID_PUBLIC_KEY=//p' "$BUNDLE_DIR/images/build-info.env" | head -n1)"
    VAPID_PRIVATE_KEY="$(sed -n 's/^VAPID_PRIVATE_KEY=//p' "$BUNDLE_DIR/images/build-info.env" | head -n1)"
    ok "Web-Push keypair (from the pre-built image)"
  elif gen_vapid; then
    ok "Web-Push keypair"
  else
    warn "Could not generate a Web-Push keypair — browser notifications stay off."
    VAPID_PUBLIC_KEY=""; VAPID_PRIVATE_KEY=""
  fi
fi

# =============================================================================
# 5. Install files
# =============================================================================
step "Installing to $TT_INSTALL_DIR"

mkdir -p "$TT_INSTALL_DIR"
chmod 750 "$TT_INSTALL_DIR"

cp -f "$BUNDLE_DIR/docker-compose.yml" "$TT_INSTALL_DIR/"
cp -f "$BUNDLE_DIR"/{update.sh,backup.sh,restore.sh,uninstall.sh} "$TT_INSTALL_DIR/"
cp -rf "$BUNDLE_DIR/lib" "$TT_INSTALL_DIR/"
cp -rf "$BUNDLE_DIR/templates" "$TT_INSTALL_DIR/"
chmod +x "$TT_INSTALL_DIR"/*.sh
ok "Scripts and stack definition copied"

# The app source is only needed when the image has to be built here.
if [ "$OFFLINE" = "0" ]; then
  [ -d "$BUNDLE_DIR/app" ] || die "The app/ folder is missing from this bundle — an online install cannot build the image.
Use --offline together with the images in images/, or get a complete bundle."
  info "Copying the application source (this can take a moment)…"
  rm -rf "$TT_INSTALL_DIR/app"
  cp -r "$BUNDLE_DIR/app" "$TT_INSTALL_DIR/app"
  ok "Application source copied"
fi

TT_VERSION="$TT_VERSION_DEFAULT"
[ -f "$BUNDLE_DIR/VERSION" ] && TT_VERSION="$(tr -d ' \t\n\r' <"$BUNDLE_DIR/VERSION")"

render_template "$BUNDLE_DIR/templates/env.template" "$TT_INSTALL_DIR/.env" \
  "TT_VERSION=$TT_VERSION" \
  "TT_DOMAIN=$DOMAIN" \
  "TT_HTTP_PORT=$HTTP_PORT" \
  "TT_HTTPS_PORT=$HTTPS_PORT" \
  "POSTGRES_PASSWORD=$POSTGRES_PASSWORD" \
  "SESSION_SECRET=$SESSION_SECRET" \
  "SYNC_SECRET=$SYNC_SECRET" \
  "VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY" \
  "VAPID_PRIVATE_KEY=$VAPID_PRIVATE_KEY" \
  "APP_URL=$APP_URL" \
  "ADMIN_USERNAME=$ADMIN_USERNAME" \
  "ADMIN_EMAIL=$ADMIN_EMAIL"
chmod 600 "$TT_INSTALL_DIR/.env"
ok "Configuration written to $TT_INSTALL_DIR/.env (readable by root only)"

if [ "$USE_TLS" = "1" ]; then
  render_template "$BUNDLE_DIR/templates/Caddyfile.domain" "$TT_INSTALL_DIR/Caddyfile" \
    "DOMAIN=$DOMAIN" "ACME_EMAIL=$ADMIN_EMAIL"
else
  render_template "$BUNDLE_DIR/templates/Caddyfile.local" "$TT_INSTALL_DIR/Caddyfile" \
    "HTTP_PORT=$HTTP_PORT"
fi
ok "Web-server configuration written"

# =============================================================================
# 6. Images
# =============================================================================
if [ "$OFFLINE" = "1" ]; then
  step "Loading the container images from this stick"
  shopt -s nullglob
  IMAGE_FILES=("$BUNDLE_DIR"/images/*.tar "$BUNDLE_DIR"/images/*.tar.gz)
  shopt -u nullglob
  [ "${#IMAGE_FILES[@]}" -gt 0 ] || die "No image archives found in $BUNDLE_DIR/images/.
An offline install needs them. Run install.sh without --offline instead (requires internet)."
  for f in "${IMAGE_FILES[@]}"; do
    info "Loading $(basename "$f") …"
    if [ "${f##*.}" = "gz" ]; then gunzip -c "$f" | docker load >/dev/null
    else docker load -i "$f" >/dev/null; fi
  done
  ok "${#IMAGE_FILES[@]} image archive(s) loaded"
  docker image inspect "task-tracker:$TT_VERSION" >/dev/null 2>&1 \
    || die "The loaded images do not contain task-tracker:$TT_VERSION.
Check images/build-info.env — the VERSION file and the image tag must match."
  # docker-compose.yml declares a build context; keep the path valid so that
  # `compose ps/exec/cp` never trip over it in an offline install.
  mkdir -p "$TT_INSTALL_DIR/app"
  [ -f "$TT_INSTALL_DIR/app/README.txt" ] || cat >"$TT_INSTALL_DIR/app/README.txt" <<'EOF'
Empty on purpose: this instance was installed offline from a pre-built image,
so the application source is not needed here. Building from source requires an
internet connection and a bundle that includes the app/ folder.
EOF
else
  step "Building the application image (5–15 minutes on first run)"
  info "This downloads the Node.js base image and the app dependencies."
  ( cd "$TT_INSTALL_DIR" && dc build app ) || die "The image build failed. Scroll up for the reason.
If this machine has no internet, use: sudo ./install.sh --offline"
  ok "Application image built"
  info "Fetching PostgreSQL and Caddy…"
  ( cd "$TT_INSTALL_DIR" && dc pull postgres caddy ) >/dev/null 2>&1 \
    || die "Could not download the PostgreSQL/Caddy images."
  ok "All images ready"
fi

# =============================================================================
# 7. Start
# =============================================================================
step "Starting Task Tracker"
dc up -d --no-build
ok "Containers started"

info "Waiting for the database migrations to finish…"
APP_CID=""
HEALTHY=0
for i in $(seq 1 150); do
  APP_CID="$(dc ps -q app 2>/dev/null | head -n1)"
  if [ -n "$APP_CID" ]; then
    state="$(docker inspect -f '{{.State.Health.Status}}' "$APP_CID" 2>/dev/null || echo starting)"
    [ "$state" = "healthy" ] && { HEALTHY=1; break; }
    if [ "$(docker inspect -f '{{.State.Status}}' "$APP_CID" 2>/dev/null)" = "exited" ]; then
      err "The application container stopped unexpectedly. Last log lines:"
      dc logs --tail 40 app >&2 || true
      die "Startup failed."
    fi
  fi
  [ $((i % 10)) = 0 ] && info "still starting… (${i}0s)"
  sleep 2
done
[ "$HEALTHY" = "1" ] || {
  err "The application did not become healthy within 5 minutes. Last log lines:"
  dc logs --tail 40 app >&2 || true
  die "Startup failed. Check: cd $TT_INSTALL_DIR && $DC logs -f app"
}
ok "Application is healthy — database migrations applied"

# =============================================================================
# 8. Administrator account
# =============================================================================
step "Setting up the administrator account"

TENANT_SLUG="$(printf '%s' "$ORG_NAME" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-//; s/-$//')"
[ -z "$TENANT_SLUG" ] && TENANT_SLUG="main"

dc cp "$TT_INSTALL_DIR/lib/bootstrap-admin.cjs" app:/app/bootstrap-admin.cjs >/dev/null
BOOTSTRAP_OUT="$(dc exec -T \
  -e "TT_TENANT_SLUG=$TENANT_SLUG" -e "TT_TENANT_NAME=$ORG_NAME" -e "TT_LOCALE=$LOCALE" \
  -e "ADMIN_USERNAME=$ADMIN_USERNAME" -e "ADMIN_PASSWORD=$ADMIN_PASSWORD" -e "ADMIN_EMAIL=$ADMIN_EMAIL" \
  app node /app/bootstrap-admin.cjs 2>&1)" || {
    err "$BOOTSTRAP_OUT"; die "Could not create the administrator account."
  }
# /app is root-owned inside the image, so the cleanup needs --user root.
dc exec -T --user root app rm -f /app/bootstrap-admin.cjs >/dev/null 2>&1 || true

case "$BOOTSTRAP_OUT" in
  *status=created*) ok "Administrator '$ADMIN_USERNAME' created" ;;
  *status=exists*)
    ok "Administrator '$ADMIN_USERNAME' already exists — password unchanged"
    GENERATED_PASSWORD=0; ADMIN_PASSWORD="(unchanged)" ;;
  *) warn "Unexpected output from the bootstrap step: $BOOTSTRAP_OUT" ;;
esac

# =============================================================================
# 9. Nightly backup
# =============================================================================
if [ "$WITH_BACKUP_TIMER" = "1" ] && command -v systemctl >/dev/null 2>&1 && [ -d /etc/systemd/system ]; then
  step "Setting up the nightly backup"
  cat >/etc/systemd/system/task-tracker-backup.service <<EOF
[Unit]
Description=Task Tracker nightly backup
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=$TT_INSTALL_DIR/backup.sh --quiet
EOF
  cat >/etc/systemd/system/task-tracker-backup.timer <<'EOF'
[Unit]
Description=Run the Task Tracker backup every night at 03:30

[Timer]
OnCalendar=*-*-* 03:30:00
RandomizedDelaySec=15m
Persistent=true

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload >/dev/null 2>&1 || true
  if systemctl enable --now task-tracker-backup.timer >/dev/null 2>&1; then
    ok "A backup now runs every night at 03:30 into $TT_BACKUP_DIR"
  else
    warn "Could not activate the backup timer — run ./backup.sh by hand instead."
  fi
fi

# =============================================================================
# 10. Summary
# =============================================================================
CRED_FILE="$TT_INSTALL_DIR/ACCESS.txt"
{
  echo "Task Tracker — access details"
  echo "Installed: $(date -u '+%Y-%m-%d %H:%M UTC')"
  echo
  echo "Address:  $APP_URL"
  echo "Login:    $ADMIN_USERNAME"
  echo "Password: $ADMIN_PASSWORD"
  echo
  echo "Configuration: $TT_INSTALL_DIR/.env"
  echo "Backups:       $TT_BACKUP_DIR"
  echo
  echo "Change the password after the first login: avatar menu -> Settings."
} >"$CRED_FILE"
chmod 600 "$CRED_FILE"

printf '\n%s' "$C_GREEN"
cat <<'EOF'
  ┌──────────────────────────────────────────────┐
  │        Installation complete.  ✓             │
  └──────────────────────────────────────────────┘
EOF
printf '%s\n' "$C_RESET"

printf '  %sAddress %s  %s\n' "$C_BOLD" "$C_RESET" "$APP_URL"
printf '  %sLogin   %s  %s\n' "$C_BOLD" "$C_RESET" "$ADMIN_USERNAME"
printf '  %sPassword%s  %s\n' "$C_BOLD" "$C_RESET" "$ADMIN_PASSWORD"
echo
if [ "$GENERATED_PASSWORD" = "1" ]; then
  warn "Write this password down now — change it after the first login."
fi
info "It is also saved in $CRED_FILE (root only)."
echo
if [ "$USE_TLS" = "1" ]; then
  info "The HTTPS certificate is issued on the first request and can take up to a"
  info "minute. $DOMAIN must resolve to this server and ports 80+443 must be open."
fi
info "Everyday commands (run them in $TT_INSTALL_DIR):"
info "  ./backup.sh     make a backup now"
info "  ./restore.sh    restore a backup"
info "  ./update.sh     update to a newer version"
info "  ./uninstall.sh  remove Task Tracker"
echo
