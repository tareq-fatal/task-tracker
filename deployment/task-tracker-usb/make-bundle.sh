#!/usr/bin/env bash
# =============================================================================
# Task Tracker USB bundle — PACKAGING SCRIPT (for us, not for the customer).
#
# Produces the folder that goes onto the USB stick, plus a .tar.gz (and a .zip
# when `zip` is installed) — all named task-tracker-onprem-v<VERSION>.
#
#   ./make-bundle.sh                     # online bundle (small, ~5 MB)
#   ./make-bundle.sh --offline           # + docker save images (~600 MB)
#   ./make-bundle.sh --offline --debs    # + Docker .deb packages for air-gapped
#                                        #   hosts with no apt mirror
#   ./make-bundle.sh --offline --debs --app-name "Coast Shield" --out /mnt/e
#
# TOF-0794 (Tarek 31.10.2026): package "task-tracker-onprem"; --app-name is
# compiled into the offline image (NEXT_PUBLIC_APP_NAME) and recorded in
# images/build-info.env; --debs fetches one set per Ubuntu release
# (packages/jammy = 22.04, packages/noble = 24.04); offline bundles carry NO
# Web-Push key unless --push is given (push needs the internet).
#
# The "online" bundle carries the application source and builds the image on the
# customer's server. The "offline" bundle additionally carries pre-built images,
# so the customer's server needs no internet at all.
#
# IMPORTANT — Web Push in offline bundles: NEXT_PUBLIC_* values are compiled
# into the image by `next build` and cannot be changed afterwards. With --push
# an offline bundle gets ONE VAPID keypair, generated here, baked into the image
# and written to images/build-info.env for install.sh --offline --push to pick
# up. Every customer installed from the same offline bundle shares that keypair
# — regenerate the bundle per customer if that matters to you. Without --push
# (the default since TOF-0794) the image has no push key at all.
# =============================================================================
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$BUNDLE_DIR/../.." && pwd)"
# shellcheck source=lib/common.sh
. "$BUNDLE_DIR/lib/common.sh"

OFFLINE=0
WITH_DEBS=0
WITH_PUSH=0
APP_NAME=""
# Ubuntu releases install.sh supports, as codename=docker base image.
DEB_RELEASES=("jammy=ubuntu:22.04" "noble=ubuntu:24.04")
OUT_DIR="${OUT_DIR:-$REPO_ROOT/dist}"
GIT_REF="HEAD"

usage() {
  cat <<'EOF'
Usage: ./make-bundle.sh [options]

  --offline       Also build and export the container images into images/.
  --debs          Also download the Docker .deb packages (with their
                  dependencies) into packages/jammy and packages/noble
                  (for hosts with neither internet nor an apt mirror).
  --app-name <n>  Instance name compiled into the offline image, e.g.
                  "Coast Shield" (NEXT_PUBLIC_APP_NAME).
  --push          Offline image WITH a Web-Push key (only useful if the
                  clients have internet). Default: no push.
  --ref <ref>     Git ref to snapshot as the app source.       [default: HEAD]
  --out <dir>     Where to write the folder + archives.  [default: <repo>/dist]
  -h, --help      Show this help.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --offline) OFFLINE=1; shift ;;
    --debs) WITH_DEBS=1; shift ;;
    --app-name) APP_NAME="${2:-}"; shift 2 ;;
    --push) WITH_PUSH=1; shift ;;
    --ref) GIT_REF="${2:-HEAD}"; shift 2 ;;
    --out) OUT_DIR="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) err "Unknown option: $1"; usage; exit 1 ;;
  esac
done

[ -n "$OUT_DIR" ] || die "--out needs a directory."
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"
# Same character rules as install.sh (.env / Caddyfile safe).
APP_NAME="$(printf '%s' "$APP_NAME" | tr -d '"\\$#{}`\r\n' | sed 's/^ *//; s/ *$//')"
if [ -n "$APP_NAME" ] && [ "$OFFLINE" = "0" ]; then
  warn "--app-name only matters for --offline bundles (online installs take install.sh --app-name)."
fi

VERSION="$(tr -d ' \t\n\r' <"$BUNDLE_DIR/VERSION")"
NAME="task-tracker-onprem-v$VERSION"
STAGE="$OUT_DIR/$NAME"
TARGZ="$OUT_DIR/$NAME.tar.gz"
ZIP="$OUT_DIR/$NAME.zip"

step "Packaging Task Tracker on-prem bundle v$VERSION"
info "Repository: $REPO_ROOT"
info "Source ref: $GIT_REF ($(git -C "$REPO_ROOT" rev-parse --short "$GIT_REF"))"
info "Output:     $STAGE"

rm -rf "$STAGE"
mkdir -p "$STAGE"

# --- 1. Bundle files ----------------------------------------------------------
step "Copying the bundle files"
cp "$BUNDLE_DIR"/{docker-compose.yml,install.sh,update.sh,backup.sh,restore.sh,uninstall.sh,invite.sh} "$STAGE/"
cp "$BUNDLE_DIR"/{README.md,VERSION} "$STAGE/"
cp -r "$BUNDLE_DIR/lib" "$BUNDLE_DIR/templates" "$STAGE/"
mkdir -p "$STAGE/docs" "$STAGE/images" "$STAGE/packages"
# Only the finished PDFs go on the stick — not the HTML they are generated from
# — plus OFFLINE.md for the customer's IT (which outside connections exist).
find "$BUNDLE_DIR/docs" -maxdepth 1 -name '*.pdf' -exec cp {} "$STAGE/docs/" \; 2>/dev/null || true
if [ -f "$BUNDLE_DIR/docs/OFFLINE.md" ]; then cp "$BUNDLE_DIR/docs/OFFLINE.md" "$STAGE/docs/"; fi
chmod +x "$STAGE"/*.sh
# CRLF in a shell script makes bash fail with a confusing "\r: not found"; this
# script may well be run from a Windows checkout. Templates too: a \r would end
# up inside every .env value.
find "$STAGE" \( -name '*.sh' -o -name '*.cjs' -o -name 'Caddyfile.*' -o -name 'env.template' -o -name '*.yml' \) \
  -exec sed -i 's/\r$//' {} \;
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

  VAPID_PUBLIC_KEY=""; VAPID_PRIVATE_KEY=""
  if [ "$WITH_PUSH" = "1" ]; then
    gen_vapid || die "Could not generate the VAPID keypair."
    info "VAPID public key for this bundle: ${VAPID_PUBLIC_KEY:0:20}…"
  else
    info "No Web-Push key (offline default — use --push to include one)."
  fi
  if [ -n "$APP_NAME" ]; then info "Instance name compiled in: $APP_NAME"; fi

  docker build \
    --build-arg "NEXT_PUBLIC_VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY" \
    --build-arg "NEXT_PUBLIC_APP_NAME=$APP_NAME" \
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
  # Exactly the tags docker-compose.yml names — install.sh --offline sets
  # pull_policy never, so these must load under precisely these names.
  docker save postgres:16-alpine caddy:2-alpine | gzip -1 >"$STAGE/images/base.tar.gz"
  ok "base.tar.gz: $(du -h "$STAGE/images/base.tar.gz" | cut -f1)"
  digest_of() { docker image inspect -f '{{if .RepoDigests}}{{index .RepoDigests 0}}{{else}}{{.Id}}{{end}}' "$1" 2>/dev/null || echo unknown; }

  cat >"$STAGE/images/build-info.env" <<EOF
# Generated by make-bundle.sh — read by install.sh in offline mode.
# The public key below is COMPILED INTO task-tracker:$VERSION; the private key
# must therefore be the one it was built with.
TT_VERSION=$VERSION
SOURCE_COMMIT=$(git -C "$REPO_ROOT" rev-parse "$GIT_REF")
BUILT_AT=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
# TOF-0794: instance name compiled into the image (empty = default per language).
APP_NAME=$APP_NAME
# Images in this bundle (tag = what docker-compose.yml uses; digest = exact build).
IMAGE_APP=task-tracker:$VERSION
IMAGE_POSTGRES=postgres:16-alpine
IMAGE_POSTGRES_DIGEST=$(digest_of postgres:16-alpine)
IMAGE_CADDY=caddy:2-alpine
IMAGE_CADDY_DIGEST=$(digest_of caddy:2-alpine)
# Web Push: empty unless built with --push.
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
# TOF-0794: one set PER UBUNTU RELEASE — .debs from noble can fail on jammy's
# older libraries. Each set is resolved in a clean container of that release
# with `apt-get install --download-only`, so the dependencies a minimal server
# may lack (iptables, libltdl7, pigz, …) come along. install.sh picks the set
# matching VERSION_CODENAME from /etc/os-release. Architecture = this machine's
# (docker run uses the host platform); build on x86_64 for x86_64 servers.
if [ "$WITH_DEBS" = "1" ]; then
  step "Downloading the Docker .deb packages (jammy + noble)"
  for rel in "${DEB_RELEASES[@]}"; do
    codename="${rel%%=*}"; base_image="${rel#*=}"
    mkdir -p "$STAGE/packages/$codename"
    info "$codename ($base_image)…"
    # Git Bash (Windows build host): "/c/…:/out" would be rewritten into a Windows
    # path LIST ("…;C:\out") — hand docker a native path and switch the rewrite off.
    out_dir="$STAGE/packages/$codename"
    command -v cygpath >/dev/null 2>&1 && out_dir="$(cygpath -w "$out_dir")"
    MSYS_NO_PATHCONV=1 docker run --rm -e "CODENAME=$codename" -v "$out_dir":/out "$base_image" bash -c '
      set -euo pipefail
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -qq
      apt-get install -y -qq --no-install-recommends ca-certificates curl >/dev/null
      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
      chmod a+r /etc/apt/keyrings/docker.asc
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $CODENAME stable" \
        > /etc/apt/sources.list.d/docker.list
      apt-get update -qq
      apt-get clean
      apt-get install -y -qq --no-install-recommends --download-only \
        docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin \
        iptables >/dev/null
      cp /var/cache/apt/archives/*.deb /out/
      chmod 644 /out/*.deb
    ' || warn "Could not download the .deb packages for $codename."
    if compgen -G "$STAGE/packages/$codename/*.deb" >/dev/null; then
      ok "$codename: $(find "$STAGE/packages/$codename" -name '*.deb' | wc -l) packages ($(du -sh "$STAGE/packages/$codename" | cut -f1))"
    else
      rmdir "$STAGE/packages/$codename" 2>/dev/null || true
    fi
  done
else
  cat >"$STAGE/packages/README.txt" <<'EOF'
Empty on purpose.

If Docker is missing, install.sh downloads it from get.docker.com. For a server
that cannot reach the internet at all, ask for a bundle built with --debs: the
Docker .deb packages then live here (packages/jammy for Ubuntu 22.04,
packages/noble for Ubuntu 24.04) and install.sh installs them from the stick.
EOF
fi

# --- 5. Archives ----------------------------------------------------------------------
# TOF-0794: .tar.gz always (keeps the executable bits and LF endings for Ubuntu);
# .zip in addition when `zip` is installed (handy on Windows).
step "Creating the archives"
rm -f "$TARGZ" "$ZIP"
tar -C "$OUT_DIR" -czf "$TARGZ" "$NAME"
ok "$TARGZ ($(du -h "$TARGZ" | cut -f1))"
if command -v zip >/dev/null 2>&1; then
  ( cd "$OUT_DIR" && zip -qr "$(basename "$ZIP")" "$NAME" )
  ok "$ZIP ($(du -h "$ZIP" | cut -f1))"
else
  info "'zip' is not installed — only the .tar.gz was created."
fi

echo
ok "Done."
info "Folder: $STAGE"
info "Archive: $TARGZ"
[ -f "$ZIP" ] && info "Zip:     $ZIP"
info "Copy the FOLDER onto the USB stick (or unpack the .tar.gz there:"
info "  tar -xzf $NAME.tar.gz) so install.sh can be run straight off the stick."
