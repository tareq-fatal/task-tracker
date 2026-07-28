#!/usr/bin/env bash
# =============================================================================
# Task Tracker USB bundle — shared shell helpers.
# Sourced by install.sh / update.sh / backup.sh / restore.sh / uninstall.sh.
# Not meant to be executed directly.
# =============================================================================

# --- Where a finished installation lives -------------------------------------
# The USB stick is not a good home for a running service (it gets unplugged), so
# install.sh copies the stack here and everything afterwards runs from here.
TT_INSTALL_DIR="${TT_INSTALL_DIR:-/opt/task-tracker}"
TT_BACKUP_DIR="${TT_BACKUP_DIR:-/var/backups/task-tracker}"

# --- Output ------------------------------------------------------------------
if [ -t 1 ] && [ "${NO_COLOR:-}" = "" ]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_RED=$'\033[1;31m'; C_GREEN=$'\033[1;32m'; C_YELLOW=$'\033[1;33m'
  C_BLUE=$'\033[1;36m'
else
  C_RESET=""; C_BOLD=""; C_DIM=""; C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""
fi

step()  { printf '\n%s▶ %s%s\n' "$C_BLUE" "$*" "$C_RESET"; }
ok()    { printf '%s  ✓ %s%s\n' "$C_GREEN" "$*" "$C_RESET"; }
info()  { printf '%s    %s%s\n' "$C_DIM" "$*" "$C_RESET"; }
warn()  { printf '%s  ! %s%s\n' "$C_YELLOW" "$*" "$C_RESET" >&2; }
err()   { printf '%s  ✗ %s%s\n' "$C_RED" "$*" "$C_RESET" >&2; }
die()   { err "$*"; exit 1; }

# --- Privileges --------------------------------------------------------------
# Docker, /opt and port 80 all need root. Re-exec through sudo rather than
# failing halfway through with a confusing permission error.
require_root() {
  [ "$(id -u)" = "0" ] && return 0
  if command -v sudo >/dev/null 2>&1; then
    warn "Root privileges are required — re-running through sudo."
    exec sudo -E "$0" "$@"
  fi
  die "This script must run as root (and 'sudo' is not installed)."
}

# --- Docker ------------------------------------------------------------------
# Compose v2 ships as a docker plugin ("docker compose"); some older installs
# only have the standalone v1 binary. Resolve once, use everywhere.
DC=""
resolve_compose() {
  if docker compose version >/dev/null 2>&1; then
    DC="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    DC="docker-compose"
  else
    return 1
  fi
  return 0
}

# Run compose against the installed stack, wherever this script was called from.
dc() {
  # shellcheck disable=SC2086  # $DC is intentionally word-split ("docker compose")
  $DC --project-directory "$TT_INSTALL_DIR" -f "$TT_INSTALL_DIR/docker-compose.yml" "$@"
}

docker_ready() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

# --- Config ------------------------------------------------------------------
# Read a single key out of the installed .env without sourcing it (values may
# contain characters the shell would try to interpret).
# NOTE on pipelines in this bundle: every script runs with `set -o pipefail`, so
# a pipeline whose READER exits early (head -n1, head -c N, grep -q) kills the
# writer with SIGPIPE and makes the whole pipeline fail with 141. Several
# helpers below are written the long way round purely to avoid that.
env_get() {
  local key="$1" file="${2:-$TT_INSTALL_DIR/.env}"
  [ -f "$file" ] || return 1
  # `sed -n 1p` (not `1q`) keeps reading to EOF, so the upstream sed never gets
  # SIGPIPE when the key appears more than once.
  sed -n "s/^${key}=//p" "$file" | sed -n '1p'
}

require_installed() {
  [ -f "$TT_INSTALL_DIR/docker-compose.yml" ] && [ -f "$TT_INSTALL_DIR/.env" ] \
    || die "No installation found in $TT_INSTALL_DIR — run install.sh first."
  resolve_compose || die "Docker Compose is not available."
}

# --- Prompts -----------------------------------------------------------------
# All prompts honour TT_ASSUME_YES / --yes so the whole bundle can run
# unattended (that is what the automated test does).
TT_ASSUME_YES="${TT_ASSUME_YES:-0}"

confirm() {
  local prompt="$1" default="${2:-n}" reply
  if [ "$TT_ASSUME_YES" = "1" ]; then
    info "$prompt — auto-confirmed (--yes)"
    return 0
  fi
  local hint="[y/N]"; [ "$default" = "y" ] && hint="[Y/n]"
  printf '%s%s %s %s' "$C_BOLD" "$prompt" "$hint" "$C_RESET"
  read -r reply </dev/tty || reply=""
  reply="${reply:-$default}"
  case "$reply" in [yY]*) return 0 ;; *) return 1 ;; esac
}

# ask <var-name> <prompt> [default]
ask() {
  local __var="$1" prompt="$2" default="${3:-}" reply
  if [ "$TT_ASSUME_YES" = "1" ]; then
    printf -v "$__var" '%s' "$default"
    info "$prompt → ${default:-<empty>} (--yes)"
    return 0
  fi
  if [ -n "$default" ]; then
    printf '%s%s%s %s[%s]%s: ' "$C_BOLD" "$prompt" "$C_RESET" "$C_DIM" "$default" "$C_RESET"
  else
    printf '%s%s%s: ' "$C_BOLD" "$prompt" "$C_RESET"
  fi
  read -r reply </dev/tty || reply=""
  printf -v "$__var" '%s' "${reply:-$default}"
}

# --- Secret generation --------------------------------------------------------
# openssl is present on every supported base image and, unlike /dev/urandom
# piped through tr, gives a predictable alphabet.
rand_hex()    { openssl rand -hex "${1:-32}"; }
rand_base64() { openssl rand -base64 "${1:-32}" | tr -d '\n='; }

# A password safe to paste into a URL / .env without quoting: no /, +, =, or
# shell metacharacters. Built by appending filtered chunks and slicing in the
# shell — `tr </dev/urandom | head -c N` would die of SIGPIPE under pipefail.
rand_password() {
  local n="${1:-24}" out=""
  while [ "${#out}" -lt "$n" ]; do
    out="$out$(openssl rand -base64 48 | LC_ALL=C tr -dc 'A-Za-z0-9')"
  done
  printf '%s' "${out:0:n}"
}

# VAPID keypair (Web Push, RFC 8292): a P-256 key whose two halves are
# base64url-encoded raw bytes. Generated with plain openssl so this also works
# on a machine with no internet and no node_modules.
#   - public : the 65-byte uncompressed EC point, i.e. the tail of the DER
#              SubjectPublicKeyInfo.
#   - private: the 32-byte scalar, i.e. the OCTET STRING at offset 7 of the DER
#              ECPrivateKey (30 77 02 01 01 04 20 <32 bytes> ...).
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

gen_vapid() {
  local keyfile derfile pubfile
  keyfile="$(mktemp)"; derfile="$(mktemp)"; pubfile="$(mktemp)"
  chmod 600 "$keyfile" "$derfile" "$pubfile"
  openssl ecparam -name prime256v1 -genkey -noout -out "$keyfile" 2>/dev/null \
    || { rm -f "$keyfile" "$derfile" "$pubfile"; return 1; }

  # Both halves are cut out of FILES rather than out of a pipe: `head -c 32` on
  # an openssl pipeline would SIGPIPE openssl and fail under pipefail.
  openssl ec -in "$keyfile" -pubout -outform DER -out "$pubfile" 2>/dev/null
  openssl ec -in "$keyfile" -outform DER -out "$derfile" 2>/dev/null
  VAPID_PUBLIC_KEY="$(tail -c 65 "$pubfile" | b64url)"
  VAPID_PRIVATE_KEY="$(dd if="$derfile" bs=1 skip=7 count=32 2>/dev/null | b64url)"
  rm -f "$keyfile" "$derfile" "$pubfile"

  # 65 raw bytes -> 87 base64url chars; 32 -> 43. Anything else means the DER
  # layout was not what we assumed and the keys would silently not work.
  [ "${#VAPID_PUBLIC_KEY}" = "87" ] && [ "${#VAPID_PRIVATE_KEY}" = "43" ]
}

# --- Misc ---------------------------------------------------------------------
# Replace __TOKEN__ placeholders in a template. Values go through a sed-safe
# escape so slashes and ampersands in passwords cannot corrupt the output.
sed_escape() { printf '%s' "$1" | sed -e 's/[&|\\]/\\&/g'; }

render_template() {
  local src="$1" dst="$2"; shift 2
  local script="" pair key value
  for pair in "$@"; do
    key="${pair%%=*}"; value="${pair#*=}"
    script="${script}s|__${key}__|$(sed_escape "$value")|g;"
  done
  sed -e "$script" "$src" >"$dst"
}

timestamp() { date -u +%Y%m%d-%H%M%S; }
