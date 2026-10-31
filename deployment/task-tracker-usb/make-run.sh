#!/usr/bin/env bash
# =============================================================================
# Task Tracker on-prem — builds the ONE-FILE INSTALLER (for the publisher).
#
#   ./make-run.sh <bundle-folder> [--out <dir>]
#   ./make-run.sh dist/task-tracker-onprem-v1.2.0 --out dist
#
# Output: task-tracker-onprem-<VERSION>.run  = a bash header + the bundle folder
#         as an appended tar.gz, and next to it
#         task-tracker-onprem-<VERSION>.run.sha256  (sha256sum format).
#
# The recipient runs:   sudo bash task-tracker-onprem-<VERSION>.run
# The header (below, written verbatim into the .run) checks root, Ubuntu and
# free space, verifies the SHA-256 of the embedded archive BEFORE unpacking,
# unpacks into a private directory under /var/tmp, asks four questions (name,
# logo, language, address) and calls install.sh. Non-interactive:
#   sudo bash x.run -- --app-name "X" --locale ar --yes
#
# TOF-0795 (Tarek 31.10.2026): self-extracting installer without makeself or any
# other downloaded tool — only bash, tar, gzip, sha256sum, tail. Works on a
# Windows build machine under Git Bash, too.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'EOF'
Usage: ./make-run.sh <bundle-folder> [--out <dir>]

  <bundle-folder>  A finished bundle folder (task-tracker-onprem-v<VERSION>),
                   as written by make-bundle.sh.
  --out <dir>      Where to write the .run + .run.sha256.
                   [default: the folder that contains the bundle folder]
  -h, --help       Show this help.
EOF
}

SRC=""; OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    -*) err "Unknown option: $1"; usage; exit 1 ;;
    *) [ -z "$SRC" ] || die "Only one bundle folder, please."; SRC="$1"; shift ;;
  esac
done

[ -n "$SRC" ] || { usage; exit 1; }
[ -d "$SRC" ] || die "Not a folder: $SRC"
SRC="$(cd "$SRC" && pwd)"
[ -f "$SRC/install.sh" ] && [ -f "$SRC/VERSION" ] && [ -f "$SRC/lib/common.sh" ] \
  || die "$SRC does not look like a bundle folder (install.sh, VERSION, lib/common.sh)."
for tool in tar gzip sha256sum tail; do
  command -v "$tool" >/dev/null 2>&1 || die "'$tool' is required."
done

VERSION="$(tr -d ' \t\n\r' <"$SRC/VERSION")"
[[ "$VERSION" =~ ^[0-9A-Za-z._-]+$ ]] || die "Odd VERSION '$VERSION'."
PARENT="$(dirname "$SRC")"
BASE="$(basename "$SRC")"
[ -n "$OUT" ] || OUT="$PARENT"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
RUN="$OUT/task-tracker-onprem-$VERSION.run"
SUM="$RUN.sha256"
OFFLINE_BUNDLE=0
[ -f "$SRC/images/task-tracker.tar.gz" ] && OFFLINE_BUNDLE=1

step "Building $(basename "$RUN")"
info "Bundle:  $SRC ($( [ "$OFFLINE_BUNDLE" = "1" ] && echo offline || echo online ))"

PAYLOAD="$(mktemp "$OUT/.payload-XXXXXX")"
HEADER="$(mktemp "$OUT/.header-XXXXXX")"
trap 'rm -f "$PAYLOAD" "$HEADER"' EXIT

# --- 1. Payload: the bundle folder as tar.gz ----------------------------------
info "Packing the bundle (this takes a while for an offline bundle)…"
# --owner/--group 0: the recipient's tar must not try to restore our build user.
tar -C "$PARENT" --owner=0 --group=0 -czf "$PAYLOAD" "$BASE"
PAYLOAD_SHA="$(sha256sum "$PAYLOAD" | cut -d' ' -f1)"
PAYLOAD_BYTES="$(wc -c <"$PAYLOAD" | tr -d ' ')"
ok "Payload: $PAYLOAD_BYTES bytes, SHA-256 $PAYLOAD_SHA"

# --- 2. Header ------------------------------------------------------------------
# Written with a quoted heredoc (nothing expands here); the @@…@@ placeholders
# are filled in afterwards. The number of header lines is fixed by then, so the
# payload starts at line TT_HEADER_LINES + 1.
cat >"$HEADER" <<'RUNHEADER'
#!/usr/bin/env bash
# =============================================================================
# Task Tracker — self-extracting on-premise installer, version @@VERSION@@.
#
#   sudo bash task-tracker-onprem-@@VERSION@@.run              # interactive
#   sudo bash task-tracker-onprem-@@VERSION@@.run -- --app-name "X" --locale ar --yes
#   bash task-tracker-onprem-@@VERSION@@.run --check           # verify only
#   bash task-tracker-onprem-@@VERSION@@.run --extract-only <dir>
#   bash task-tracker-onprem-@@VERSION@@.run --help
#
# Usage notice: NUTZUNGSHINWEISE.md inside the package.
# TOF-0795 (Tarek 31.10.2026): built by make-run.sh — a bash header followed by
# the package as tar.gz. Nothing below the header is ever executed; the archive
# is checked against the SHA-256 recorded here before anything is unpacked.
# =============================================================================
set -euo pipefail

TT_RUN_VERSION="@@VERSION@@"
TT_PAYLOAD_SHA256="@@SHA256@@"
TT_PAYLOAD_BYTES="@@BYTES@@"
TT_BUNDLE_NAME="@@BUNDLE@@"
TT_RUN_OFFLINE="@@OFFLINE@@"
TT_HEADER_LINES=@@LINES@@
TT_MIN_FREE_KB=$((2 * 1024 * 1024))

SELF="$0"
case "$SELF" in /*) ;; *) SELF="$(pwd)/$SELF" ;; esac

say()  { printf '%s\n' "$*"; }
fail() { printf '  x %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<EOF
Task Tracker on-premise installer $TT_RUN_VERSION

  sudo bash $(basename "$SELF")                 install (asks 4 questions)
  sudo bash $(basename "$SELF") -- <options>    install without questions; the
                                     options go straight to install.sh, e.g.
                                     -- --app-name "X" --locale ar --yes
  bash $(basename "$SELF") --check              only verify the checksum
  bash $(basename "$SELF") --extract-only <dir> only unpack into <dir>
  sudo bash $(basename "$SELF") --keep          keep the unpacked package in
                                     /opt/task-tracker-installer-$TT_RUN_VERSION
  bash $(basename "$SELF") --help               this text

Everything is checked first: root, Ubuntu 22.04/24.04, free space in /var/tmp,
and the SHA-256 checksum of the embedded package.
EOF
}

payload() { tail -n +"$((TT_HEADER_LINES + 1))" "$SELF"; }

verify() {
  local got
  got="$(payload | sha256sum | cut -d' ' -f1)"
  if [ "$got" != "$TT_PAYLOAD_SHA256" ]; then
    printf '  x Checksum MISMATCH — the file is damaged or incomplete. Copy it again.\n' >&2
    printf '    expected %s\n    got      %s\n' "$TT_PAYLOAD_SHA256" "$got" >&2
    return 1
  fi
  say "  ✓ Checksum OK (SHA-256 $TT_PAYLOAD_SHA256)"
}

MODE="install"; EXTRACT_TO=""; KEEP=0; PASS=(); HAVE_PASS=0
while [ $# -gt 0 ]; do
  case "$1" in
    --) shift; PASS=("$@"); HAVE_PASS=1; break ;;
    --check) MODE="check"; shift ;;
    --extract-only) MODE="extract"; EXTRACT_TO="${2:-}"; [ -n "$EXTRACT_TO" ] || fail "--extract-only needs a folder."; shift 2 ;;
    --keep) KEEP=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown option: $1  (options for install.sh go after --, see --help)" ;;
  esac
done

say ""
say "  Task Tracker — on-premise installer $TT_RUN_VERSION"
say ""

if [ "$MODE" = "check" ]; then verify; exit $?; fi

if [ "$MODE" = "extract" ]; then
  verify
  mkdir -p "$EXTRACT_TO"
  payload | tar -xzf - -C "$EXTRACT_TO" --no-same-owner
  say "  ✓ Unpacked: $(cd "$EXTRACT_TO" && pwd)/$TT_BUNDLE_NAME"
  exit 0
fi

# --- install --------------------------------------------------------------------
if [ "$(id -u)" != "0" ]; then
  fail "Please run as root:   sudo bash $(basename "$SELF")"
fi

OS_ID=""; OS_VER=""
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_ID="${ID:-}"; OS_VER="${VERSION_ID:-}"
fi
case "$OS_ID:$OS_VER" in
  ubuntu:22.04|ubuntu:24.04) say "  ✓ ${PRETTY_NAME:-Ubuntu $OS_VER}" ;;
  *) printf '  ! %s is not Ubuntu 22.04/24.04 — tested only there. Continuing.\n' "${PRETTY_NAME:-This system}" >&2 ;;
esac

FREE_KB="$(df -Pk /var/tmp 2>/dev/null | awk 'NR==2 {print $4}')"
FREE_KB="${FREE_KB:-0}"
NEED_KB=$(( TT_PAYLOAD_BYTES / 1024 * 2 ))
[ "$NEED_KB" -lt "$TT_MIN_FREE_KB" ] && NEED_KB="$TT_MIN_FREE_KB"
if [ "$FREE_KB" -lt "$NEED_KB" ]; then
  fail "Not enough free space in /var/tmp: $((FREE_KB / 1024)) MB free, $((NEED_KB / 1024)) MB needed."
fi
say "  ✓ Free space in /var/tmp: $((FREE_KB / 1024)) MB"

verify

WORK="$(mktemp -d "/var/tmp/task-tracker-onprem-$TT_RUN_VERSION.XXXXXX")"
chmod 700 "$WORK"
DONE=0
cleanup() {
  if [ "$DONE" != "1" ] && [ -d "$WORK" ]; then
    rm -rf "$WORK"
    printf '  ! Installation not finished — the unpacked files were removed again.\n' >&2
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

say "  … unpacking to $WORK"
payload | tar -xzf - -C "$WORK" --no-same-owner
BUNDLE="$WORK/$TT_BUNDLE_NAME"
[ -f "$BUNDLE/install.sh" ] || fail "The package is incomplete (install.sh missing)."
say "  ✓ Unpacked"

# shellcheck source=/dev/null
. "$BUNDLE/lib/common.sh"

# An existing installation is UPDATED (backup first, automatic rollback) instead
# of being installed over.
if [ -f "$TT_INSTALL_DIR/.env" ] && [ "$HAVE_PASS" = "0" ]; then
  step "Existing installation found in $TT_INSTALL_DIR"
  info "Installed: $(env_get TT_VERSION || echo unknown)   This package: $TT_RUN_VERSION"
  if confirm "Update it now (a full backup is made first)?" y; then
    bash "$BUNDLE/update.sh" --from "$BUNDLE"
    DONE=1
    [ "$KEEP" = "1" ] || rm -rf "$WORK"
    ok "Update finished."
    exit 0
  fi
  info "Not updating — installing over it instead (data and secrets are kept)."
fi

ARGS=()
if [ "$HAVE_PASS" = "1" ]; then
  # Non-interactive: the options after -- replace the questions.
  if [ "$TT_RUN_OFFLINE" = "1" ]; then
    case " ${PASS[*]-} " in *" --offline "*) ;; *) ARGS+=(--offline) ;; esac
  fi
  ARGS+=(${PASS[@]+"${PASS[@]}"})
else
  step "Four questions — Enter keeps the suggestion in [brackets]"
  NAME_SUGGESTION="$(build_info_get APP_NAME_DEFAULT "$BUNDLE/images/build-info.env")"
  [ -n "$NAME_SUGGESTION" ] || NAME_SUGGESTION="Task Tracker"

  echo
  info "1) Name der Oberfläche / Interface name / اسم الواجهة"
  ask Q_NAME "   Name" "$NAME_SUGGESTION"

  echo
  info "2) Logo (PNG/JPG/WEBP/SVG, max. 2 MB) — leer = keins / empty = none / فارغ = بدون شعار"
  Q_LOGO=""
  while :; do
    ask Q_LOGO "   Path / Pfad / المسار" ""
    [ -z "$Q_LOGO" ] && break
    Q_LOGO="${Q_LOGO/#\~/$HOME}"
    if validate_logo "$Q_LOGO"; then break; fi
    warn "Try again or leave empty / Erneut versuchen oder leer lassen / حاول مجددًا أو اتركه فارغًا"
  done

  echo
  info "3) Sprache / Language / اللغة:  ar = العربية · de = Deutsch · en = English"
  while :; do
    ask Q_LOCALE "   ar / de / en" "de"
    case "$Q_LOCALE" in ar|de|en) break ;; esac
    warn "ar, de or en"
  done

  echo
  info "4) Adresse / Address / العنوان"
  DETECTED_IP="$(detect_lan_ip)"
  ask Q_HOST "   Host name, optional (e.g. tracker.firma.local) / اسم الخادم (اختياري)" ""
  ask Q_IP "   IP address / IP-Adresse / عنوان IP" "$DETECTED_IP"
  if [ -n "$Q_IP" ] && ! is_ipv4 "$Q_IP"; then fail "'$Q_IP' is not an IPv4 address."; fi
  [ -n "$Q_HOST$Q_IP" ] || fail "A host name or an IP address is needed."

  [ "$TT_RUN_OFFLINE" = "1" ] && ARGS+=(--offline)
  ARGS+=(--tls internal --app-name "$Q_NAME" --tenant-name "$Q_NAME" --locale "$Q_LOCALE")
  [ -n "$Q_HOST" ] && ARGS+=(--host "$Q_HOST")
  [ -n "$Q_IP" ] && ARGS+=(--ip "$Q_IP")
  [ -n "$Q_LOGO" ] && ARGS+=(--logo "$Q_LOGO")
  ARGS+=(--yes)
fi

step "Starting install.sh"
bash "$BUNDLE/install.sh" ${ARGS[@]+"${ARGS[@]}"}

DONE=1
if [ "$KEEP" = "1" ]; then
  KEEP_DIR="/opt/task-tracker-installer-$TT_RUN_VERSION"
  rm -rf "$KEEP_DIR"
  mv "$BUNDLE" "$KEEP_DIR"
  chmod 700 "$KEEP_DIR"
  rm -rf "$WORK"
  info "Package kept in $KEEP_DIR"
else
  # install.sh copied everything it needs to /opt/task-tracker and the images
  # are loaded into Docker — the unpacked copy is not needed any more. Keep the
  # .run file itself: it IS the package (updates, re-installs).
  rm -rf "$WORK"
fi

ADDR="$(env_get TT_PUBLIC_URL 2>/dev/null || true)"
echo
ok "Done."
[ -n "$ADDR" ] && info "Address / Adresse / العنوان:  $ADDR"
info "Invite link + certificate: sudo cat $TT_INSTALL_DIR/ACCESS.txt"
info "Usage notice: $TT_INSTALL_DIR/NUTZUNGSHINWEISE.md"
exit 0
RUNHEADER

HEADER_LINES="$(wc -l <"$HEADER" | tr -d ' ')"
sed -i \
  -e "s|@@VERSION@@|$VERSION|g" \
  -e "s|@@SHA256@@|$PAYLOAD_SHA|g" \
  -e "s|@@BYTES@@|$PAYLOAD_BYTES|g" \
  -e "s|@@BUNDLE@@|$BASE|g" \
  -e "s|@@OFFLINE@@|$OFFLINE_BUNDLE|g" \
  -e "s|@@LINES@@|$HEADER_LINES|g" \
  "$HEADER"
# The substitution must not change the line count (payload offset).
[ "$(wc -l <"$HEADER" | tr -d ' ')" = "$HEADER_LINES" ] || die "Header line count changed."
# CRLF from a Windows checkout would break the header.
sed -i 's/\r$//' "$HEADER"
bash -n "$HEADER" || die "The generated header has a syntax error."

# --- 3. Assemble ----------------------------------------------------------------
cat "$HEADER" "$PAYLOAD" >"$RUN.tmp"
mv -f "$RUN.tmp" "$RUN"
chmod 755 "$RUN"
( cd "$OUT" && sha256sum "$(basename "$RUN")" >"$(basename "$SUM")" )

# Self-test: the payload read back the way the header reads it must match.
check="$(tail -n +"$((HEADER_LINES + 1))" "$RUN" | sha256sum | cut -d' ' -f1)"
[ "$check" = "$PAYLOAD_SHA" ] || die "Self-test failed: embedded payload does not match."

ok "$RUN ($(du -h "$RUN" | cut -f1))"
ok "$SUM"
info "Recipient: sudo bash $(basename "$RUN")"
info "Check:     sha256sum -c $(basename "$SUM")   (or: bash $(basename "$RUN") --check)"
