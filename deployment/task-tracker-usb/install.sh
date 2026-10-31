#!/usr/bin/env bash
# =============================================================================
# Task Tracker — one-click installer.
#
#   sudo ./install.sh                 # normal (online) install
#   sudo ./install.sh --offline       # no internet: use the images in images/
#   sudo ./install.sh --offline --tls internal --app-name "Coast Shield" --locale ar
#   sudo ./install.sh --help          # all options
#
# What it does, in order:
#   1. checks the machine (OS, RAM, disk, free ports)
#   2. installs Docker if it is missing
#   3. asks for the TLS mode, address, admin e-mail and interface language
#   4. generates every secret this instance needs (no admin password!)
#   5. copies the stack to /opt/task-tracker and starts it
#   6. applies the database migrations and creates the superuser account,
#      which gets a ONE-TIME INVITE LINK to set its own password
#
# TOF-0794 (Tarek 31.10.2026): on-prem package "task-tracker-onprem" —
#   --tls internal (default) HTTPS from Caddy's own local CA, no internet needed
#   --tls domain             Let's Encrypt (needs internet + public DNS)
#   --tls http               plain HTTP on the LAN (COOKIE_SECURE=false)
#   superuser by invite link instead of a generated password; ./invite.sh
#   mints a fresh link. --admin-password remains as an explicit exception.
#
# Safe to re-run: an existing installation is detected, its data is left alone
# and the existing administrator password is never reset.
# =============================================================================
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "$BUNDLE_DIR/lib/common.sh"

TT_VERSION_DEFAULT="1.1.0"
DOCKER_INSTALL_URL="https://get.docker.com"

# --- Options ------------------------------------------------------------------
OFFLINE=0
SKIP_DOCKER_INSTALL=0
WITH_BACKUP_TIMER=1
ARG_DOMAIN=""; ARG_EMAIL=""; ARG_ADMIN_USER=""; ARG_ADMIN_PASS=""
ARG_LOCALE=""; ARG_ORG=""
# TOF-0794
ARG_TLS=""; ARG_HOST=""; ARG_IPS=""; ARG_APP_NAME=""; ARG_PUSH=0
ARG_NEW_INVITE=0; INVITE_HOURS="72"
HTTP_PORT="80"; HTTPS_PORT="443"

# Kept for the sudo re-exec below: the parsing loop shifts them all away.
ORIG_ARGS=("$@")

usage() {
  cat <<'EOF'
Task Tracker installer

Usage: sudo ./install.sh [options]

  --offline              Install without internet. Loads the container images
                         from images/ instead of building/pulling them, and
                         switches off everything that needs the internet
                         (TT_OFFLINE=1, no Web Push, no mail service).
  --tls <mode>           internal  HTTPS with Caddy's own local CA — no
                                   internet needed, devices import the root
                                   certificate once.               [default]
                         domain    Let's Encrypt for --domain (needs internet
                                   and a public DNS name).
                         http      Plain HTTP on the LAN, no certificate.
  --host <name>          --tls internal: host name, e.g. tracker.marine.local
                         (must resolve to this server in your network).
  --ip <address>         --tls internal/http: LAN IP of this server, e.g.
                         192.168.1.10. Repeatable or comma-separated.
                         [default: detected automatically]
  --domain <name>        --tls domain: public domain, e.g. tasks.example.com.
  --email <address>      Administrator e-mail (with --tls domain also used for
                         the Let's Encrypt certificate account).
  --admin-user <name>    Superuser login name.                [default: admin]
  --admin-password <pw>  EXCEPTION: set this password instead of an invite
                         link. Not recommended (lands in the shell history).
  --invite-hours <n>     Validity of the invite link in hours.    [default: 72]
  --new-invite           Re-run on an existing installation: mint a fresh
                         invite link for the superuser (same as ./invite.sh).
  --app-name <name>      Instance name in the UI, e.g. "Coast Shield". Online:
                         built into the image here. Offline: comes from the
                         bundle (make-bundle.sh --app-name).
  --tenant-name <name>   Workspace (tenant) name.        [default: app name]
  --org <name>           Same as --tenant-name (older spelling).
  --locale <ar|de|en>    Default interface language + the superuser's own
                         language.                                [default: de]
  --push                 Offline only: keep Web Push on (needs a bundle built
                         with make-bundle.sh --push AND internet on the
                         clients). Off by default offline.
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
    --tls) ARG_TLS="${2:-}"; shift 2 ;;
    --host) ARG_HOST="${2:-}"; shift 2 ;;
    --ip) ARG_IPS="${ARG_IPS:+$ARG_IPS,}${2:-}"; shift 2 ;;
    --app-name) ARG_APP_NAME="${2:-}"; shift 2 ;;
    --tenant-name) ARG_ORG="${2:-}"; shift 2 ;;
    --invite-hours) INVITE_HOURS="${2:-72}"; shift 2 ;;
    --new-invite) ARG_NEW_INVITE=1; shift ;;
    --push) ARG_PUSH=1; shift ;;
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

case "$ARG_TLS" in ""|internal|domain|http) ;; *) die "--tls must be internal, domain or http (got '$ARG_TLS')." ;; esac
[[ "$INVITE_HOURS" =~ ^[0-9]+$ ]] && [ "$INVITE_HOURS" -ge 1 ] || die "--invite-hours must be a positive number."
# common.sh derived this from the default before --install-dir was parsed.
TT_CA_DIR="$TT_INSTALL_DIR/ca"

require_root ${ORIG_ARGS[@]+"${ORIG_ARGS[@]}"}

printf '%s\n' "$C_BOLD"
cat <<'EOF'
  ┌──────────────────────────────────────────────┐
  │            T A S K   T R A C K E R           │
  │          On-Premise Installation             │
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

# Capture first, match in the shell: `… | grep -q` under pipefail returns 141
# on a match (SIGPIPE for the writer), which reads as "no match".
port_busy() {
  local p="$1" listening=""
  if command -v ss >/dev/null 2>&1; then
    listening="$(ss -ltnH "sport = :$p" 2>/dev/null || true)"
    [ -n "$listening" ] && return 0
  elif command -v netstat >/dev/null 2>&1; then
    listening="$(netstat -ltn 2>/dev/null || true)"
    case "$listening" in *:"$p"[[:space:]]*) return 0 ;; esac
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

# Minimal cloud images ship without openssl or curl, and every password this
# installer generates comes out of openssl. Fix that before anything needs them.
MISSING=""
command -v openssl >/dev/null 2>&1 || MISSING="$MISSING openssl"
if [ "$OFFLINE" = "0" ]; then
  command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1 || MISSING="$MISSING curl"
  [ -e /etc/ssl/certs/ca-certificates.crt ] || MISSING="$MISSING ca-certificates"
fi
if [ -n "$MISSING" ]; then
  if [ "$OFFLINE" = "1" ]; then
    die "These programs are missing and cannot be installed offline:$MISSING
Install them from your distribution media, then re-run:  apt-get install$MISSING"
  fi
  info "Installing the missing base packages:$MISSING"
  # shellcheck disable=SC2086  # deliberate word splitting of the package list
  DEBIAN_FRONTEND=noninteractive apt-get update -qq >/dev/null 2>&1 \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends $MISSING >/dev/null 2>&1 \
    || die "Could not install:$MISSING
Install them by hand (apt-get install$MISSING) and re-run this script."
  ok "Base packages installed:$MISSING"
else
  ok "All required base programs are present"
fi

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

# TOF-0794: make-bundle.sh --debs ships one set per Ubuntu release in
# packages/<codename>/ (jammy = 22.04, noble = 24.04) — .debs built for the
# wrong release can fail on library versions. Older bundles had one flat set in
# packages/; that is still accepted as a fallback.
install_docker_offline() {
  local codename="${VERSION_CODENAME:-${UBUNTU_CODENAME:-}}" debs=()
  shopt -s nullglob
  if [ -n "$codename" ] && [ -d "$BUNDLE_DIR/packages/$codename" ]; then
    debs=("$BUNDLE_DIR/packages/$codename"/*.deb)
  fi
  [ "${#debs[@]}" -gt 0 ] || debs=("$BUNDLE_DIR"/packages/*.deb)
  shopt -u nullglob
  if [ "${#debs[@]}" -eq 0 ]; then
    err "No Docker packages for '${codename:-unknown}' in $BUNDLE_DIR/packages/ (expected packages/jammy or packages/noble)."
    return 1
  fi
  info "Installing Docker from the packages on this stick (${codename:-generic}, ${#debs[@]} files)…"
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

# The daemon is not necessarily running yet (fresh install, or a host without
# systemd). Try each start method in turn and VERIFY after each one — a start
# command that returns 0 without a working daemon is common in containers.
docker_up() {
  local tries="${1:-20}"
  for _ in $(seq 1 "$tries"); do
    docker info >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

start_docker() {
  if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
    info "Starting Docker via systemd…"
    systemctl enable --now docker >/dev/null 2>&1 || true
    docker_up 25 && return 0
  fi
  if [ -x /etc/init.d/docker ]; then
    info "Starting Docker via its init script…"
    service docker start >/dev/null 2>&1 || /etc/init.d/docker start >/dev/null 2>&1 || true
    docker_up 25 && return 0
  fi
  # Last resort — LXC / container hosts / images without any service manager.
  warn "No working service manager for Docker — starting the daemon directly."
  ( dockerd >/var/log/dockerd.log 2>&1 & ) || true
  if docker_up 30; then
    warn "Docker was started by hand and will NOT survive a reboot of this"
    warn "machine. Arrange for 'dockerd' to be started at boot."
    return 0
  fi
  return 1
}

if ! docker info >/dev/null 2>&1; then
  start_docker || {
    err "The Docker daemon is not responding."
    [ -s /var/log/dockerd.log ] && { err "Last lines of /var/log/dockerd.log:"; tail -n 15 /var/log/dockerd.log >&2; }
    die "Check 'systemctl status docker' (or /var/log/dockerd.log) and re-run this script."
  }
fi
ok "Docker daemon is running"

resolve_compose || die "Docker Compose is missing. Install the docker-compose-plugin package and re-run."
ok "Docker Compose is available ($DC)"

# =============================================================================
# 3. Configuration
# =============================================================================
step "Configuration"

# --- 3a. TLS mode (TOF-0794) ---------------------------------------------------
TLS_MODE="$ARG_TLS"
if [ -z "$TLS_MODE" ] && [ "$REINSTALL" = "1" ]; then
  TLS_MODE="$(env_get TT_TLS_MODE || true)"
  if [ -z "$TLS_MODE" ]; then
    # Installed by bundle 1.0.x, which only knew "domain" or plain HTTP. Keep
    # what it was — never switch a running instance's address silently.
    if [ -n "$(env_get TT_DOMAIN || true)" ]; then TLS_MODE="domain"; else TLS_MODE="http"; fi
  fi
fi
[ -z "$TLS_MODE" ] && [ -n "$ARG_DOMAIN" ] && TLS_MODE="domain"
if [ -z "$TLS_MODE" ]; then
  if [ "$TT_ASSUME_YES" = "1" ]; then
    TLS_MODE="internal"
  else
    echo
    info "How should browsers reach this server?"
    info "  internal  HTTPS with this server's own certificate authority — works"
    info "            without internet; every device imports one certificate once."
    info "  domain    HTTPS from Let's Encrypt — needs internet and a public domain."
    info "  http      plain HTTP inside the LAN, no encryption."
    ask TLS_MODE "TLS mode" "internal"
  fi
fi
case "$TLS_MODE" in internal|domain|http) ;; *) die "Unknown TLS mode '$TLS_MODE' (internal, domain or http)." ;; esac

DOMAIN=""; TT_HOST=""; TT_IPS=""; IP_LIST=()
case "$TLS_MODE" in
  domain)
    DOMAIN="$ARG_DOMAIN"
    [ -z "$DOMAIN" ] && [ "$REINSTALL" = "1" ] && DOMAIN="$(env_get TT_DOMAIN || true)"
    if [ -z "$DOMAIN" ]; then
      info "Enter the public domain name pointing at this server (e.g. tasks.example.com)."
      ask DOMAIN "Domain name" ""
    fi
    # A bare IP or 'localhost' cannot get a Let's Encrypt certificate.
    # Matched with bash's own =~ rather than `printf | grep -q`, which returns
    # 141 under pipefail exactly when it matches.
    if [ -z "$DOMAIN" ] || [ "$DOMAIN" = "localhost" ] || is_ipv4 "$DOMAIN"; then
      die "--tls domain needs a public domain name (got '${DOMAIN:-<empty>}'). Use --tls internal for a LAN install."
    elif ! [[ "$DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$ ]]; then
      die "'$DOMAIN' is not a valid domain name."
    fi
    if [ "$OFFLINE" = "1" ]; then
      warn "--tls domain needs internet (Let's Encrypt) — this is an offline install."
      confirm "Continue anyway?" n || die "Aborted. Use --tls internal for a server without internet."
    fi
    ;;
  internal|http)
    TT_HOST="$ARG_HOST"
    if [ -z "$TT_HOST" ] && [ -z "$ARG_IPS" ] && [ "$REINSTALL" = "1" ]; then
      TT_HOST="$(env_get TT_HOST || true)"
    fi
    TT_IPS="$ARG_IPS"
    if [ -z "$TT_IPS" ] && [ -z "$ARG_HOST" ] && [ "$REINSTALL" = "1" ]; then
      TT_IPS="$(env_get TT_IPS || true)"
    fi
    # TOF-0794 (Test 31.10.): also WITH --host — devices that open the server by
    # its IP must get a certificate for that IP too (else: name mismatch).
    if [ -z "$TT_IPS" ]; then
      TT_IPS="$(detect_lan_ip)"
      [ -n "$TT_IPS" ] && info "LAN address detected: $TT_IPS (override with --ip)"
    fi
    TT_IPS="$(printf '%s' "$TT_IPS" | tr -d ' ')"
    [ -n "$TT_IPS" ] && IFS=',' read -r -a IP_LIST <<<"$TT_IPS"
    for ip in ${IP_LIST[@]+"${IP_LIST[@]}"}; do
      is_ipv4 "$ip" || die "'$ip' is not an IPv4 address (--ip)."
    done
    if [ -n "$TT_HOST" ] && ! [[ "$TT_HOST" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$ ]]; then
      die "'$TT_HOST' is not a valid host name (--host)."
    fi
    if [ "$TLS_MODE" = "http" ]; then
      [ "${#IP_LIST[@]}" -gt 0 ] || die "Could not detect this server's LAN address — pass it with --ip 192.168.x.y"
    else
      [ -n "$TT_HOST" ] || [ "${#IP_LIST[@]}" -gt 0 ] \
        || die "--tls internal needs --host <name> and/or --ip <address> (the LAN address could not be detected)."
    fi
    ;;
esac

ADMIN_EMAIL="$ARG_EMAIL"
if [ -z "$ADMIN_EMAIL" ] && [ "$REINSTALL" = "1" ]; then
  ADMIN_EMAIL="$(env_get ADMIN_EMAIL || true)"
fi
[ -z "$ADMIN_EMAIL" ] && ask ADMIN_EMAIL "Administrator e-mail" "admin@${DOMAIN:-${TT_HOST:-task-tracker.local}}"

ADMIN_USERNAME="${ARG_ADMIN_USER:-}"
[ -z "$ADMIN_USERNAME" ] && [ "$REINSTALL" = "1" ] && ADMIN_USERNAME="$(env_get ADMIN_USERNAME || true)"
[ -z "$ADMIN_USERNAME" ] && ask ADMIN_USERNAME "Superuser login name" "admin"
[[ "$ADMIN_USERNAME" =~ ^[A-Za-z0-9._-]+$ ]] || die "'$ADMIN_USERNAME' is not a valid login name (letters, digits, . _ -)."

# --- 3b. Name / tenant (TOF-0794) ----------------------------------------------
# Strip what would break .env / the Caddyfile: quotes, $, #, backslash, braces.
clean_name() { printf '%s' "$1" | tr -d '"\\$#{}`\r\n' | sed 's/^ *//; s/ *$//'; }

BUILD_INFO="$BUNDLE_DIR/images/build-info.env"
BUNDLE_APP_NAME="$(build_info_get APP_NAME "$BUILD_INFO")"
APP_NAME="$(clean_name "${ARG_APP_NAME:-}")"
if [ "$OFFLINE" = "1" ]; then
  # The name is compiled into the pre-built image — the bundle decides.
  if [ -n "$APP_NAME" ] && [ "$APP_NAME" != "$BUNDLE_APP_NAME" ]; then
    warn "--app-name \"$APP_NAME\" differs from the name built into this bundle (\"${BUNDLE_APP_NAME:-<default>}\")."
    warn "The UI will show \"${BUNDLE_APP_NAME:-the default name}\". Build a matching bundle with:"
    warn "  ./make-bundle.sh --offline --app-name \"$APP_NAME\""
    confirm "Continue anyway?" y || die "Aborted."
  fi
  APP_NAME_UI="$BUNDLE_APP_NAME"
  [ -z "$APP_NAME" ] && APP_NAME="$BUNDLE_APP_NAME"
else
  if [ -z "$APP_NAME" ] && [ "$REINSTALL" = "1" ]; then
    APP_NAME="$(env_get NEXT_PUBLIC_APP_NAME || true)"
  fi
  APP_NAME_UI="$APP_NAME"
fi

ORG_NAME="$(clean_name "${ARG_ORG:-}")"
[ -z "$ORG_NAME" ] && ask ORG_NAME "Workspace (tenant) name" "${APP_NAME:-Task Tracker}"
ORG_NAME="$(clean_name "$ORG_NAME")"
[ -z "$ORG_NAME" ] && ORG_NAME="${APP_NAME:-Task Tracker}"

LOCALE="${ARG_LOCALE:-}"
[ -z "$LOCALE" ] && [ "$REINSTALL" = "1" ] && LOCALE="$(env_get DEFAULT_LOCALE || true)"
if [ -z "$LOCALE" ]; then
  ask LOCALE "Default language — ar (العربية), de (Deutsch) or en (English)" "de"
fi
case "$LOCALE" in ar|de|en) ;; *) warn "Unknown language '$LOCALE' — using 'de'."; LOCALE="de" ;; esac

# Invite link by default; --admin-password is the explicit exception.
ADMIN_PASSWORD="${ARG_ADMIN_PASS:-}"

# --- 3c. Address --------------------------------------------------------------
FIRST_IP="${IP_LIST[0]:-}"
COOKIE_SECURE=""
case "$TLS_MODE" in
  domain)
    APP_URL="https://$DOMAIN"
    [ "$HTTPS_PORT" != "443" ] && APP_URL="$APP_URL:$HTTPS_PORT"
    ok "Address: $APP_URL (Let's Encrypt certificate, obtained automatically)"
    ;;
  internal)
    PORT_SUFFIX=""
    [ "$HTTPS_PORT" != "443" ] && PORT_SUFFIX=":$HTTPS_PORT"
    APP_URL="https://${TT_HOST:-$FIRST_IP}$PORT_SUFFIX"
    ok "Address: $APP_URL (certificate from this server's own CA)"
    if [ -n "$TT_HOST" ] && [ -n "$FIRST_IP" ]; then info "Also valid: https://$FIRST_IP$PORT_SUFFIX"; fi
    if [ -n "$TT_HOST" ]; then info "'$TT_HOST' must resolve to this server (DNS or hosts file on the devices)."; fi
    ;;
  http)
    APP_URL="http://$FIRST_IP"
    [ "$HTTP_PORT" != "80" ] && APP_URL="$APP_URL:$HTTP_PORT"
    COOKIE_SECURE="false"
    ok "Address: $APP_URL (plain HTTP — LAN install)"
    warn "PLAIN HTTP: passwords and data travel UNENCRYPTED through the network."
    warn "Session cookies are sent without the 'secure' flag (COOKIE_SECURE=false)."
    warn "Use this only in a closed, trusted network — prefer --tls internal."
    ;;
esac

# =============================================================================
# 4. Secrets
# =============================================================================
step "Generating secrets"

# TOF-0794: Web Push is delivered through the browser vendors' push services on
# the internet — offline installs leave it off unless --push is given.
PUSH_WANTED=1
[ "$OFFLINE" = "1" ] && [ "$ARG_PUSH" != "1" ] && PUSH_WANTED=0

if [ "$REINSTALL" = "1" ]; then
  # Reuse everything — regenerating the DB password would lock out the existing
  # data directory, and a new SESSION_SECRET would log everybody out.
  POSTGRES_PASSWORD="$(env_get POSTGRES_PASSWORD)"
  SESSION_SECRET="$(env_get SESSION_SECRET)"
  SYNC_SECRET="$(env_get SYNC_SECRET)"
  VAPID_PUBLIC_KEY="$(env_get NEXT_PUBLIC_VAPID_PUBLIC_KEY || true)"
  VAPID_PRIVATE_KEY="$(env_get VAPID_PRIVATE_KEY || true)"
  ok "Reusing the existing secrets (an update must not invalidate them)"
  if [ "$PUSH_WANTED" = "0" ] && [ -n "$VAPID_PRIVATE_KEY" ]; then
    VAPID_PUBLIC_KEY=""; VAPID_PRIVATE_KEY=""
    info "Offline: Web Push switched off (it needs the internet)."
  fi
else
  POSTGRES_PASSWORD="$(rand_password 32)"; ok "Database password"
  SESSION_SECRET="$(rand_hex 32)";         ok "Session secret"
  SYNC_SECRET="$(rand_hex 32)";            ok "Sync/cron secret"
  VAPID_PUBLIC_KEY=""; VAPID_PRIVATE_KEY=""
  if [ "$PUSH_WANTED" = "0" ]; then
    info "Offline: no Web-Push keys (browser push needs the internet)."
  elif [ "$OFFLINE" = "1" ]; then
    # The public half is compiled into the pre-built image, so the private half
    # has to be the one it was generated with.
    VAPID_PUBLIC_KEY="$(build_info_get VAPID_PUBLIC_KEY "$BUILD_INFO")"
    VAPID_PRIVATE_KEY="$(build_info_get VAPID_PRIVATE_KEY "$BUILD_INFO")"
    if [ -n "$VAPID_PRIVATE_KEY" ]; then
      ok "Web-Push keypair (from the pre-built image)"
    else
      warn "--push: this bundle was built without Web Push (make-bundle.sh --push) — it stays off."
    fi
  elif gen_vapid; then
    ok "Web-Push keypair"
  else
    warn "Could not generate a Web-Push keypair — browser notifications stay off."
    VAPID_PUBLIC_KEY=""; VAPID_PRIVATE_KEY=""
  fi
fi
[ -z "$ADMIN_PASSWORD" ] && ok "No administrator password — the superuser gets a one-time invite link"

# =============================================================================
# 5. Install files
# =============================================================================
step "Installing to $TT_INSTALL_DIR"

mkdir -p "$TT_INSTALL_DIR"
chmod 750 "$TT_INSTALL_DIR"

cp -f "$BUNDLE_DIR/docker-compose.yml" "$TT_INSTALL_DIR/"
cp -f "$BUNDLE_DIR"/{update.sh,backup.sh,restore.sh,uninstall.sh,invite.sh} "$TT_INSTALL_DIR/"
cp -rf "$BUNDLE_DIR/lib" "$TT_INSTALL_DIR/"
cp -rf "$BUNDLE_DIR/templates" "$TT_INSTALL_DIR/"
if [ -d "$BUNDLE_DIR/docs" ]; then
  mkdir -p "$TT_INSTALL_DIR/docs"
  find "$BUNDLE_DIR/docs" -maxdepth 1 -type f \( -name '*.pdf' -o -name '*.md' \) -exec cp -f {} "$TT_INSTALL_DIR/docs/" \;
fi
chmod +x "$TT_INSTALL_DIR"/*.sh
# Mounted read-only into caddy (http://<server>/ca.crt) — exists in every mode.
mkdir -p "$TT_CA_DIR"
chmod 755 "$TT_CA_DIR"
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

TT_OFFLINE_VALUE="0"; PULL_POLICY="missing"
if [ "$OFFLINE" = "1" ]; then TT_OFFLINE_VALUE="1"; PULL_POLICY="never"; fi

render_template "$BUNDLE_DIR/templates/env.template" "$TT_INSTALL_DIR/.env" \
  "TT_VERSION=$TT_VERSION" \
  "TT_TLS_MODE=$TLS_MODE" \
  "TT_DOMAIN=$DOMAIN" \
  "TT_HOST=$TT_HOST" \
  "TT_IPS=$TT_IPS" \
  "TT_HTTP_PORT=$HTTP_PORT" \
  "TT_HTTPS_PORT=$HTTPS_PORT" \
  "POSTGRES_PASSWORD=$POSTGRES_PASSWORD" \
  "SESSION_SECRET=$SESSION_SECRET" \
  "SYNC_SECRET=$SYNC_SECRET" \
  "VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY" \
  "VAPID_PRIVATE_KEY=$VAPID_PRIVATE_KEY" \
  "TT_OFFLINE=$TT_OFFLINE_VALUE" \
  "TT_PULL_POLICY=$PULL_POLICY" \
  "COOKIE_SECURE=$COOKIE_SECURE" \
  "APP_NAME=$APP_NAME_UI" \
  "APP_URL=$APP_URL" \
  "DEFAULT_LOCALE=$LOCALE" \
  "ADMIN_USERNAME=$ADMIN_USERNAME" \
  "ADMIN_EMAIL=$ADMIN_EMAIL"
chmod 600 "$TT_INSTALL_DIR/.env"
ok "Configuration written to $TT_INSTALL_DIR/.env (readable by root only)"

case "$TLS_MODE" in
  domain)
    render_template "$BUNDLE_DIR/templates/Caddyfile.domain" "$TT_INSTALL_DIR/Caddyfile" \
      "DOMAIN=$DOMAIN" "ACME_EMAIL=$ADMIN_EMAIL"
    ;;
  internal)
    SITE_ADDRESSES="$(printf '%s' "${TT_HOST:+$TT_HOST,}$TT_IPS" | sed 's/,$//; s/,/, /g')"
    DEFAULT_SNI="${FIRST_IP:-$TT_HOST}"
    CA_NAME="$(printf '%s' "${APP_NAME:-Task Tracker}" | LC_ALL=C tr -cd 'A-Za-z0-9 ._-' | sed 's/^ *//; s/ *$//')"
    [ -z "$CA_NAME" ] && CA_NAME="Task Tracker"
    render_template "$BUNDLE_DIR/templates/Caddyfile.internal" "$TT_INSTALL_DIR/Caddyfile" \
      "SITE_ADDRESSES=$SITE_ADDRESSES" "DEFAULT_SNI=$DEFAULT_SNI" \
      "CA_NAME=$CA_NAME" "PUBLIC_URL=$APP_URL"
    ;;
  http)
    render_template "$BUNDLE_DIR/templates/Caddyfile.local" "$TT_INSTALL_DIR/Caddyfile" \
      "HTTP_PORT=$HTTP_PORT"
    ;;
esac
ok "Web-server configuration written (TLS mode: $TLS_MODE)"

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
  # TOF-0794: TT_PULL_POLICY=never — compose fails rather than download, so
  # every image the stack names must be here now.
  for img in postgres:16-alpine caddy:2-alpine; do
    docker image inspect "$img" >/dev/null 2>&1 \
      || die "The image $img is missing from images/ — this bundle is incomplete (make-bundle.sh --offline)."
  done
  ok "All images present (nothing will be downloaded)"
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
  [ -n "$APP_NAME_UI" ] && info "Instance name built in: $APP_NAME_UI"
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
  APP_CID="$(dc ps -q app 2>/dev/null | sed -n '1p')"
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

# --- Root certificate of the local CA (TOF-0794) -------------------------------
CA_FILE=""; CA_FP=""
if [ "$TLS_MODE" = "internal" ]; then
  info "Exporting the root certificate of the local CA…"
  if export_internal_ca 30; then
    CA_FILE="$TT_CA_DIR/$TT_CA_FILE_NAME"
    CA_FP="$(ca_fingerprint || true)"
    ok "Root certificate: $CA_FILE"
  else
    warn "Caddy has not created its root certificate yet. Later, run:"
    warn "  cd $TT_INSTALL_DIR && sudo docker compose exec -T caddy cat $TT_CA_IN_CONTAINER > ca/$TT_CA_FILE_NAME"
  fi
fi

# =============================================================================
# 8. Superuser account
# =============================================================================
step "Setting up the superuser account"

TENANT_SLUG="$(printf '%s' "$ORG_NAME" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-//; s/-$//')"
[ -z "$TENANT_SLUG" ] && TENANT_SLUG="main"

BOOTSTRAP_ENV=(
  -e "TT_TENANT_SLUG=$TENANT_SLUG" -e "TT_TENANT_NAME=$ORG_NAME" -e "TT_LOCALE=$LOCALE"
  -e "ADMIN_USERNAME=$ADMIN_USERNAME" -e "ADMIN_EMAIL=$ADMIN_EMAIL"
  -e "TT_PUBLIC_URL=$APP_URL" -e "TT_INVITE_HOURS=$INVITE_HOURS" -e "TT_NEW_INVITE=$ARG_NEW_INVITE"
)
[ -n "$ADMIN_PASSWORD" ] && BOOTSTRAP_ENV+=(-e "ADMIN_PASSWORD=$ADMIN_PASSWORD")

dc cp "$TT_INSTALL_DIR/lib/bootstrap-admin.cjs" app:/app/bootstrap-admin.cjs >/dev/null
BOOTSTRAP_OUT="$(dc exec -T "${BOOTSTRAP_ENV[@]}" app node /app/bootstrap-admin.cjs 2>&1)" || {
    err "$BOOTSTRAP_OUT"; die "Could not create the superuser account."
  }
# /app is root-owned inside the image, so the cleanup needs --user root.
dc exec -T --user root app rm -f /app/bootstrap-admin.cjs >/dev/null 2>&1 || true

INVITE_URL="$(printf '%s\n' "$BOOTSTRAP_OUT" | sed -n 's/^invite_url=//p' | sed -n '1p')"
INVITE_EXPIRES="$(printf '%s\n' "$BOOTSTRAP_OUT" | sed -n 's/^invite_expires=//p' | sed -n '1p')"
ADMIN_STATUS="unknown"
case "$BOOTSTRAP_OUT" in
  *status=created*mode=password*)
    ADMIN_STATUS="password"
    ok "Superuser '$ADMIN_USERNAME' created with the password given via --admin-password" ;;
  *status=created*)
    ADMIN_STATUS="invite"
    ok "Superuser '$ADMIN_USERNAME' created — one-time invite link issued" ;;
  *status=exists*)
    ADMIN_STATUS="exists"
    if [ -n "$INVITE_URL" ]; then
      ok "Superuser '$ADMIN_USERNAME' exists — fresh invite link issued (--new-invite)"
    else
      ok "Superuser '$ADMIN_USERNAME' already exists — password unchanged, no new link (./invite.sh makes one)"
    fi ;;
  *) warn "Unexpected output from the bootstrap step: $BOOTSTRAP_OUT" ;;
esac
case "$BOOTSTRAP_OUT" in
  *renamed=empty-default-tenant*) info "Empty placeholder tenant renamed to '$ORG_NAME'." ;;
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
# TOF-0794: ACCESS.txt holds the address, the login name and the ONE-TIME invite
# link — never a password. A re-run that issues no new link keeps the previous
# file as ACCESS.prev.txt (its link may still be unused).
CRED_FILE="$TT_INSTALL_DIR/ACCESS.txt"
if [ -f "$CRED_FILE" ] && [ -z "$INVITE_URL" ]; then
  cp -f "$CRED_FILE" "$TT_INSTALL_DIR/ACCESS.prev.txt"
  chmod 600 "$TT_INSTALL_DIR/ACCESS.prev.txt"
fi
{
  echo "${APP_NAME:-Task Tracker} — access details"
  echo "Installed: $(date -u '+%Y-%m-%d %H:%M UTC')   Version: $TT_VERSION   TLS mode: $TLS_MODE"
  echo
  echo "Address:  $APP_URL"
  if [ "$TLS_MODE" = "internal" ] && [ -n "$TT_HOST" ] && [ -n "$FIRST_IP" ]; then
    echo "          https://$FIRST_IP${PORT_SUFFIX:-}  (also valid)"
  fi
  echo "Login:    $ADMIN_USERNAME   (Superuser)"
  echo
  if [ -n "$INVITE_URL" ]; then
    echo "Invite link (sets the superuser's password):"
    echo "  $INVITE_URL"
    echo "Valid until: $INVITE_EXPIRES (UTC)"
    echo "The link works ONCE (Link nur einmal gültig). Open it, choose a password,"
    echo "and you are logged in. Expired or lost?  sudo $TT_INSTALL_DIR/invite.sh"
  elif [ "$ADMIN_STATUS" = "password" ]; then
    echo "Password: as given with --admin-password (not stored anywhere)."
  else
    echo "No new invite link was issued (the superuser already existed)."
    echo "Need one?  sudo $TT_INSTALL_DIR/invite.sh   (previous details: ACCESS.prev.txt)"
  fi
  echo
  case "$TLS_MODE" in
    internal)
      echo "HTTPS certificate — this server's own certificate authority (CA)"
      echo "-----------------------------------------------------------------"
      echo "Import the ROOT certificate ONCE on every device, otherwise the browser"
      echo "shows a certificate warning:"
      echo "  File:        $TT_CA_DIR/$TT_CA_FILE_NAME"
      echo "  Download:    http://${FIRST_IP:-$TT_HOST}$([ "$HTTP_PORT" != "80" ] && printf ':%s' "$HTTP_PORT")/ca.crt"
      echo "  SHA-256:     ${CA_FP:-(not exported yet — see the installer output)}"
      echo "Compare the SHA-256 fingerprint on the device before trusting the file."
      echo
      echo "  Windows: double-click the .crt -> Install Certificate -> Local Machine ->"
      echo "           'Place all certificates in the following store' ->"
      echo "           Trusted Root Certification Authorities -> Finish. Restart the browser."
      echo "           (Firefox: Settings -> Privacy & Security -> Certificates -> Import.)"
      echo "  Android: Settings -> Security -> Encryption & credentials ->"
      echo "           Install a certificate -> CA certificate -> choose the file."
      echo "  iOS:     open the download link in Safari -> Allow -> Settings ->"
      echo "           Profile Downloaded -> Install; then Settings -> General -> About ->"
      echo "           Certificate Trust Settings -> switch the certificate ON."
      echo "  macOS:   double-click -> Keychain 'System' -> open it -> Trust: Always Trust."
      echo
      echo "The CA lives in the docker volume task-tracker_caddy_data (backed up by"
      echo "backup.sh). If that volume is lost, a NEW CA is created and every device"
      echo "must import the new root certificate."
      ;;
    http)
      echo "WARNING: plain HTTP — nothing is encrypted. Only for a closed, trusted LAN."
      echo "Session cookies are not 'secure' (COOKIE_SECURE=false in .env)."
      ;;
    domain)
      echo "HTTPS certificate: Let's Encrypt (issued on the first request; $DOMAIN must"
      echo "resolve to this server and ports 80+443 must be reachable from the internet)."
      ;;
  esac
  echo
  echo "Name / logo: Settings -> Branding (as superuser) — upload the logo there."
  echo "Configuration: $TT_INSTALL_DIR/.env"
  echo "Backups:       $TT_BACKUP_DIR (every night at 03:30)"
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
if [ -n "$INVITE_URL" ]; then
  printf '  %sInvite  %s  %s\n' "$C_BOLD" "$C_RESET" "$INVITE_URL"
  printf '  %sValid   %s  until %s (UTC), ONE use only\n' "$C_BOLD" "$C_RESET" "$INVITE_EXPIRES"
  echo
  info "Open the invite link in the browser and choose the superuser's password."
  info "Expired or lost?  sudo $TT_INSTALL_DIR/invite.sh"
fi
echo
info "Everything is also saved in $CRED_FILE (root only)."
echo
case "$TLS_MODE" in
  internal)
    info "FIRST import the root certificate on each device (see ACCESS.txt):"
    info "  $TT_CA_DIR/$TT_CA_FILE_NAME"
    [ -n "$CA_FP" ] && info "  SHA-256 $CA_FP"
    ;;
  http)
    warn "Plain HTTP — data is not encrypted. Prefer --tls internal."
    ;;
  domain)
    info "The HTTPS certificate is issued on the first request and can take up to a"
    info "minute. $DOMAIN must resolve to this server and ports 80+443 must be open."
    ;;
esac
info "Everyday commands (run them in $TT_INSTALL_DIR):"
info "  ./backup.sh     make a backup now"
info "  ./restore.sh    restore a backup"
info "  ./update.sh     update to a newer version"
info "  ./invite.sh     new invite link (e.g. the old one expired)"
info "  ./uninstall.sh  remove Task Tracker"
echo
