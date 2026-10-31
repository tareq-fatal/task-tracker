#!/usr/bin/env bash
# =============================================================================
# Task Tracker — fresh invite link (TOF-0794).
#
#   sudo ./invite.sh                   # new link for the superuser (.env ADMIN_USERNAME)
#   sudo ./invite.sh --user layla      # new link for any existing user
#   sudo ./invite.sh --hours 24        # shorter validity            [default: 72]
#
# For when the link from the installation has expired or got lost, or a user
# forgot their password. Exactly like "Einladungslink erzeugen" in the app's
# user administration: older open links of that user stop working, the new one
# can be used ONCE to set a password. Nothing else is changed — no account is
# created, the current password stays valid until the link is redeemed.
#
# The link is printed here and appended to ACCESS.txt (root only). It is as
# good as a password until it is used: hand it over personally.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

USER_NAME=""
HOURS="72"

usage() {
  cat <<'EOF'
Usage: sudo ./invite.sh [options]

  --user <name>   Login name of the user.   [default: the superuser from .env]
  --hours <n>     Validity of the link in hours.                [default: 72]
  -h, --help      Show this help.
EOF
}

ORIG_ARGS=("$@")
while [ $# -gt 0 ]; do
  case "$1" in
    --user) USER_NAME="${2:-}"; shift 2 ;;
    --hours) HOURS="${2:-72}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) err "Unknown option: $1"; usage; exit 1 ;;
  esac
done

require_root ${ORIG_ARGS[@]+"${ORIG_ARGS[@]}"}
require_installed

[[ "$HOURS" =~ ^[0-9]+$ ]] && [ "$HOURS" -ge 1 ] || die "--hours must be a positive number."
[ -z "$USER_NAME" ] && USER_NAME="$(env_get ADMIN_USERNAME || true)"
[ -n "$USER_NAME" ] || die "No user given and no ADMIN_USERNAME in .env — use --user <name>."
[[ "$USER_NAME" =~ ^[A-Za-z0-9._@-]+$ ]] || die "'$USER_NAME' is not a valid login name."

PUBLIC_URL="$(env_get TT_PUBLIC_URL || true)"
[ -z "$PUBLIC_URL" ] && PUBLIC_URL="$(env_get APP_URL || true)"
[ -z "$PUBLIC_URL" ] && PUBLIC_URL="$(env_get NEXT_PUBLIC_APP_URL || true)"
[ -n "$PUBLIC_URL" ] || die "No TT_PUBLIC_URL in $TT_INSTALL_DIR/.env — cannot build the link."

APP_CID="$(dc ps -q app 2>/dev/null | sed -n '1p')"
[ -n "$APP_CID" ] || die "The app container is not running — start it with: sudo ./update.sh --restart"

step "New invite link for '$USER_NAME'"
dc cp "$TT_INSTALL_DIR/lib/bootstrap-admin.cjs" app:/app/bootstrap-admin.cjs >/dev/null
OUT="$(dc exec -T \
  -e "TT_INVITE_ONLY=1" -e "ADMIN_USERNAME=$USER_NAME" \
  -e "TT_PUBLIC_URL=$PUBLIC_URL" -e "TT_INVITE_HOURS=$HOURS" \
  app node /app/bootstrap-admin.cjs 2>&1)" || {
    dc exec -T --user root app rm -f /app/bootstrap-admin.cjs >/dev/null 2>&1 || true
    err "$OUT"; die "No link was created."
  }
dc exec -T --user root app rm -f /app/bootstrap-admin.cjs >/dev/null 2>&1 || true

LINK="$(printf '%s\n' "$OUT" | sed -n 's/^invite_url=//p' | sed -n '1p')"
EXPIRES="$(printf '%s\n' "$OUT" | sed -n 's/^invite_expires=//p' | sed -n '1p')"
[ -n "$LINK" ] || die "Unexpected output: $OUT"

CRED_FILE="$TT_INSTALL_DIR/ACCESS.txt"
{
  echo
  echo "--- New invite link ($(date -u '+%Y-%m-%d %H:%M UTC'), user: $USER_NAME) ---"
  echo "  $LINK"
  echo "Valid until: $EXPIRES (UTC). Works ONCE (Link nur einmal gültig)."
  echo "Older links of this user no longer work."
} >>"$CRED_FILE"
chmod 600 "$CRED_FILE"

ok "Link created — valid until $EXPIRES (UTC), ONE use only:"
echo
printf '  %s\n' "$LINK"
echo
info "Older links of '$USER_NAME' no longer work. Also saved in $CRED_FILE."
info "Hand the link over personally — whoever opens it first sets the password."
