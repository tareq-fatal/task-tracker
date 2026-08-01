#!/usr/bin/env bash
# =============================================================================
# Task Tracker USB bundle — PACKAGING SCRIPT (for us, not for the customer).
#
# Produces the folder that goes onto the USB stick, and the matching .zip.
#
#   ./make-bundle.sh                     # online bundle (small, ~5 MB)
#   ./make-bundle.sh --offline           # + docker save images (~600 MB)
#   ./make-bundle.sh --offline --debs    # + Docker .deb packages for air-gapped
#                                        #   hosts with no apt mirror
#
# The "online" bundle carries the application source and builds the image on the
# customer's server. The "offline" bundle additionally carries pre-built images,
# so the customer's server needs no internet at all.
#
# IMPORTANT — Web Push in offline bundles: NEXT_PUBLIC_* values are compiled
# into the image by `next build` and cannot be changed afterwards. An offline
# bundle therefore gets ONE VAPID keypair, generated here, baked into the image
# and written to images/build-info.env for install.sh to pick up. Every customer
# installed from the same offline bundle shares that keypair — regenerate the
# bundle per customer if that matters to you.
# =============================================================================
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$BUNDLE_DIR/../.." && pwd)"
# shellcheck source=lib/common.sh
. "$BUNDLE_DIR/lib/common.sh"

OFFLINE=0
WITH_DEBS=0
OUT_DIR="${OUT_DIR:-$REPO_ROOT/dist}"
GIT_REF="HEAD"

usage() {
  cat <<'EOF'
Usage: ./make-bundle.sh [options]

  --offline       Also build and export the container images into images/.
  --debs          Also download the Docker .deb packages into packages/
                  (for hosts with neither internet nor an apt mirror).
  --ref <ref>     Git ref to snapshot as the app source.       [default: HEAD]
  --out <dir>     Where to write the bundle and the zip.    [default: ../dist]
  -h, --help      Show this help.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --offline) OFFLINE=1; shift ;;
    --debs) WITH_DEBS=1; shift ;;
    --ref) GIT_REF="${2:-HEAD}"; shift 2 ;;
    --out) OUT_DIR="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) err "Unknown option: $1"; usage; exit 1 ;;
  esac
done

VERSION="$(tr -d ' \t\n\r' <"$BUNDLE_DIR/VERSION")"
STAGE="$OUT_DIR/task-tracker-usb-v$VERSION"
ZIP="$OUT_DIR/task-tracker-usb-v$VERSION.zip"

step "Packaging Task Tracker USB bundle v$VERSION"
info "Repository: $REPO_ROOT"
info "Source ref: $GIT_REF ($(git -C "$REPO_ROOT" rev-parse --short "$GIT_REF"))"
info "Output:     $STAGE"

rm -rf "$STAGE"
mkdir -p "$STAGE"

# --- 1. Bundle files ----------------------------------------------------------
step "Copying the bundle files"
cp "$BUNDLE_DIR"/{docker-compose.yml,install.sh,update.sh,backup.sh,restore.sh,uninstall.sh} "$STAGE/"
cp "$BUNDLE_DIR"/{README.md,VERSION} "$STAGE/"
cp -r "$BUNDLE_DIR/lib" "$BUNDLE_DIR/templates" "$STAGE/"
mkdir -p "$STAGE/docs" "$STAGE/images" "$STAGE/packages"
# Only the finished PDFs go on the stick — not the HTML they are generated from.
find "$BUNDLE_DIR/docs" -maxdepth 1 -name '*.pdf' -exec cp {} "$STAGE/docs/" \; 2>/dev/null || true
chmod +x "$STAGE"/*.sh
# CRLF in a shell script makes bash fail with a confusing "\r: not found"; this
# script may well be run from a Windows checkout.
find "$STAGE" -name '*.sh' -exec sed -i 's/\r$//' {} \;
ok "Scripts, templates and documentation copied"

# --- 2. Application source -----------------------------------------------------
step "Snapshotting the application source ($GIT_REF)"
mkdir -p "$STAGE/app"
git -C "$REPO_ROOT" archive --format=tar "$GIT_REF" | tar -x -C "$STAGE/app"
# Things the image build does not need and that would only bloat the stick.
rm -rf "$STAGE/app"/{e2e,e2e-live,screenshots,releases,test-results,android,ios,worker,.github,.claude,deployment}
rm -f  "$STAGE/app"/*.tar.gz
git -C "$REPO_ROOT" rev-parse "$GIT_REF" >"$STAGE/app/.source-commit"
ok "Source: $(du -sh "$STAGE/app" | cut -f1)"

# --- 3. Offline images ----------------------------------------------------------
if [ "$OFFLINE" = "1" ]; then
  step "Building the application image (this takes a while)"
  docker info >/dev/null 2>&1 || die "The Docker daemon is not reachable."

  gen_vapid || die "Could not generate the VAPID keypair."
  info "VAPID public key for this bundle: ${VAPID_PUBLIC_KEY:0:20}…"

  docker build \
    --build-arg "NEXT_PUBLIC_VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY" \
    -t "task-tracker:$VERSION" \
    "$STAGE/app" || die "The image build failed."
  ok "task-tracker:$VERSION built"

  step "Fetching PostgreSQL and Caddy"
  docker pull postgres:16-alpine >/dev/null
  docker pull caddy:2-alpine >/dev/null
  ok "Base images fetched"

  step "Exporting the images to images/ (a few minutes)"
  docker save "task-tracker:$VERSION" | gzip -1 >"$STAGE/images/task-tracker.tar.gz"
  ok "task-tracker.tar.gz: $(du -h "$STAGE/images/task-tracker.tar.gz" | cut -f1)"
  docker save postgres:16-alpine caddy:2-alpine | gzip -1 >"$STAGE/images/base.tar.gz"
  ok "base.tar.gz: $(du -h "$STAGE/images/base.tar.gz" | cut -f1)"

  cat >"$STAGE/images/build-info.env" <<EOF
# Generated by make-bundle.sh — read by install.sh in offline mode.
# The public key below is COMPILED INTO task-tracker:$VERSION; the private key
# must therefore be the one it was built with.
TT_VERSION=$VERSION
SOURCE_COMMIT=$(git -C "$REPO_ROOT" rev-parse "$GIT_REF")
BUILT_AT=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY=$VAPID_PRIVATE_KEY
EOF
  chmod 600 "$STAGE/images/build-info.env"
  ok "images/build-info.env written"
else
  cat >"$STAGE/images/README.txt" <<'EOF'
Empty on purpose.

This is an ONLINE bundle: install.sh builds the application image on the target
server, which needs an internet connection for that one step.

For a server with no internet, ask for an OFFLINE bundle — its images/ folder
holds the ready-made container images and install.sh --offline loads them from
here instead of building anything.
EOF
  info "Online bundle — images/ stays empty (see images/README.txt)."
fi

# --- 4. Docker packages for air-gapped hosts ---------------------------------------
if [ "$WITH_DEBS" = "1" ]; then
  step "Downloading the Docker .deb packages"
  docker run --rm -v "$STAGE/packages":/out ubuntu:24.04 bash -c '
    set -e
    apt-get update -qq
    apt-get install -y -qq --no-install-recommends ca-certificates curl >/dev/null
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    cd /out
    apt-get download docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
    chmod 644 /out/*.deb
  ' || warn "Could not download the .deb packages — the bundle stays without packages/."
  if compgen -G "$STAGE/packages/*.deb" >/dev/null; then
    ok "$(find "$STAGE/packages" -name '*.deb' | wc -l) packages in packages/ ($(du -sh "$STAGE/packages" | cut -f1))"
  fi
else
  cat >"$STAGE/packages/README.txt" <<'EOF'
Empty on purpose.

If Docker is missing, install.sh downloads it from get.docker.com. For a server
that cannot reach the internet at all, ask for a bundle built with --debs: the
Docker .deb packages then live here and install.sh installs them from the stick.
EOF
fi

# --- 5. Zip -------------------------------------------------------------------------
step "Creating the archive"
rm -f "$ZIP"
if command -v zip >/dev/null 2>&1; then
  ( cd "$OUT_DIR" && zip -qr "$(basename "$ZIP")" "$(basename "$STAGE")" )
elif command -v python3 >/dev/null 2>&1; then
  python3 - "$OUT_DIR" "$(basename "$STAGE")" "$ZIP" <<'PY'
import os, sys, zipfile
root, folder, out = sys.argv[1], sys.argv[2], sys.argv[3]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for dirpath, _, files in os.walk(os.path.join(root, folder)):
        for f in files:
            p = os.path.join(dirpath, f)
            z.write(p, os.path.relpath(p, root))
PY
else
  die "Neither 'zip' nor 'python3' is available — cannot create the archive."
fi
ok "$ZIP ($(du -h "$ZIP" | cut -f1))"

echo
ok "Done."
info "Folder: $STAGE"
info "Zip:    $ZIP"
info "Copy the FOLDER onto the USB stick (not the zip) so install.sh can be run"
info "straight off the stick."
