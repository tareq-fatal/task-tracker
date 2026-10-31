#!/usr/bin/env bash
# =============================================================================
# Task Tracker on-prem bundle — PACKAGING SCRIPT (for the publisher, not for
# the recipient).
#
# Produces the folder that goes onto the USB stick, plus a .tar.gz (and a .zip
# when `zip` is installed) — all named task-tracker-onprem-v<VERSION> — and with
# --run additionally the one-file installer task-tracker-onprem-<VERSION>.run.
#
#   ./make-bundle.sh                     # online bundle (source, image is built on the server)
#   ./make-bundle.sh --offline           # pre-built images, NO source code
#   ./make-bundle.sh --offline --debs    # + Docker .deb packages for air-gapped
#                                        #   hosts with no apt mirror
#   ./make-bundle.sh --offline --debs --run --out /mnt/e
#
# TOF-0794 (Tarek 31.10.2026): package "task-tracker-onprem"; --debs fetches one
# set per Ubuntu release (packages/jammy = 22.04, packages/noble = 24.04);
# offline bundles carry NO Web-Push key unless --push is given.
#
# TOF-0795 (Tarek 31.10.2026): the bundle is handed to a THIRD PARTY —
#   * the offline image is always built NEUTRAL: NEXT_PUBLIC_APP_URL=
#     https://task-tracker.local, no NEXT_PUBLIC_APP_NAME (the name is set at
#     runtime by install.sh → APP_NAME), TT_ONPREM_IMAGE=1 (no dev seed
#     scripts in the image);
#   * --offline bundles contain NO source code (app/) — --with-source adds it
#     (emergency / rebuild on site). Online bundles always contain app/;
#   * --app-name is only a SUGGESTION for the installer (APP_NAME_DEFAULT in
#     images/build-info.env), nothing is compiled in;
#   * NUTZUNGSHINWEISE.md (usage notice) is always copied; internal material
#     (docs/CUSTOMER_OPTIONS.md, docs/*.html, docs/assets) never;
#   * --run builds the self-extracting installer (make-run.sh).
#
# IMPORTANT — Web Push in offline bundles: NEXT_PUBLIC_* values are compiled
# into the image by `next build` and cannot be changed afterwards. With --push
# an offline bundle gets ONE VAPID keypair, generated here, baked into the image
# and written to images/build-info.env for install.sh --offline --push to pick
# up. Every recipient installed from the same offline bundle shares that keypair.
# Without --push (the default) the image has no push key at all.
# =============================================================================
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$BUNDLE_DIR/../.." && pwd)"
# shellcheck source=lib/common.sh
. "$BUNDLE_DIR/lib/common.sh"

OFFLINE=0
WITH_DEBS=0
WITH_PUSH=0
WITH_SOURCE=0
WITH_RUN=0
APP_NAME_DEFAULT=""
# Ubuntu releases install.sh supports, as codename=docker base image.
DEB_RELEASES=("jammy=ubuntu:22.04" "noble=ubuntu:24.04")
OUT_DIR="${OUT_DIR:-$REPO_ROOT/dist}"
GIT_REF="HEAD"
# TOF-0795: the neutral build-time address of every pre-built image.
NEUTRAL_APP_URL="https://task-tracker.local"

usage() {
  cat <<'EOF'
Usage: ./make-bundle.sh [options]

  --offline       Build the container images and export them into images/.
                  The bundle then contains NO source code (see --with-source).
  --with-source   Also put the application source (app/) into an offline
                  bundle (allows ./update.sh --rebuild on site; online bundles
                  always contain it).
  --debs          Also download the Docker .deb packages (with their
                  dependencies) into packages/jammy and packages/noble
                  (for hosts with neither internet nor an apt mirror).
  --app-name <n>  Name SUGGESTED by the installer (images/build-info.env
                  APP_NAME_DEFAULT). Nothing is compiled in.
                                                     [default: Task Tracker]
  --push          Offline image WITH a Web-Push key (only useful if the
                  clients have internet). Default: no push.
  --run           Also build task-tracker-onprem-<VERSION>.run (one-file
                  installer, make-run.sh) + .run.sha256.
  --ref <ref>     Git ref to snapshot as the app source.       [default: HEAD]
  --out <dir>     Where to write the folder + archives.  [default: <repo>/dist]
  -h, --help      Show this help.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --offline) OFFLINE=1; shift ;;
    --with-source) WITH_SOURCE=1; shift ;;
    --debs) WITH_DEBS=1; shift ;;
    --app-name) APP_NAME_DEFAULT="${2:-}"; shift 2 ;;
    --push) WITH_PUSH=1; shift ;;
    --run) WITH_RUN=1; shift ;;
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
APP_NAME_DEFAULT="$(printf '%s' "$APP_NAME_DEFAULT" | tr -d '"\\$#{}`\r\n' | sed 's/^ *//; s/ *$//')"
[ -n "$APP_NAME_DEFAULT" ] || APP_NAME_DEFAULT="Task Tracker"
# Online bundles build the image on the server — they always need the source.
[ "$OFFLINE" = "0" ] && WITH_SOURCE=1

VERSION="$(tr -d ' \t\n\r' <"$BUNDLE_DIR/VERSION")"
NAME="task-tracker-onprem-v$VERSION"
STAGE="$OUT_DIR/$NAME"
TARGZ="$OUT_DIR/$NAME.tar.gz"
ZIP="$OUT_DIR/$NAME.zip"
BUILD_SRC=""   # temporary build context of an offline bundle without app/

cleanup_build_src() {
  if [ -n "$BUILD_SRC" ] && [ -d "$BUILD_SRC" ]; then rm -rf "$BUILD_SRC"; fi
}
trap cleanup_build_src EXIT

step "Packaging Task Tracker on-prem bundle v$VERSION"
info "Repository: $REPO_ROOT"
info "Source ref: $GIT_REF ($(git -C "$REPO_ROOT" rev-parse --short "$GIT_REF"))"
info "Output:     $STAGE"
if [ "$WITH_SOURCE" = "1" ]; then info "Source:     included (app/)"; else info "Source:     NOT included (offline bundle)"; fi

rm -rf "$STAGE"
mkdir -p "$STAGE"

# --- 1. Bundle files ----------------------------------------------------------
step "Copying the bundle files"
cp "$BUNDLE_DIR"/{docker-compose.yml,install.sh,update.sh,backup.sh,restore.sh,uninstall.sh,invite.sh} "$STAGE/"
cp "$BUNDLE_DIR"/{README.md,VERSION,NUTZUNGSHINWEISE.md} "$STAGE/"
cp -r "$BUNDLE_DIR/lib" "$BUNDLE_DIR/templates" "$STAGE/"
mkdir -p "$STAGE/docs" "$STAGE/images" "$STAGE/packages"
# Only the finished PDFs go on the stick — not the HTML they are generated from,
# not the screenshots — plus OFFLINE.md for the recipient's IT (which outside
# connections exist). docs/CUSTOMER_OPTIONS.md is internal and NEVER shipped.
find "$BUNDLE_DIR/docs" -maxdepth 1 -name 'INSTALL_*.pdf' -exec cp {} "$STAGE/docs/" \; 2>/dev/null || true
if [ -f "$BUNDLE_DIR/docs/OFFLINE.md" ]; then cp "$BUNDLE_DIR/docs/OFFLINE.md" "$STAGE/docs/"; fi
chmod +x "$STAGE"/*.sh
# CRLF in a shell script makes bash fail with a confusing "\r: not found"; this
# script may well be run from a Windows checkout. Templates too: a \r would end
# up inside every .env value.
find "$STAGE" \( -name '*.sh' -o -name '*.cjs' -o -name 'Caddyfile.*' -o -name 'env.template' -o -name '*.yml' \) \
  -exec sed -i 's/\r$//' {} \;
ok "Scripts, templates, documentation and usage notice copied"

# --- 2. Application source -----------------------------------------------------
# snapshot_source <dir> — `git archive` of GIT_REF without what neither the image
# build nor the recipient needs (internal docs, infrastructure, tests, old
# bundles, mobile projects, repo tooling).
snapshot_source() {
  local dest="$1"
  mkdir -p "$dest"
  git -C "$REPO_ROOT" archive --format=tar "$GIT_REF" | tar -x -C "$dest"
  rm -rf "$dest"/{e2e,e2e-live,screenshots,releases,test-results,android,ios,.github,.claude,deployment,dist,docs,infra,scripts,mcp,secrets}
  rm -f "$dest"/*.tar.gz "$dest"/*.md "$dest"/.mcp.json "$dest"/.env.example "$dest"/openapi.json \
        "$dest"/playwright.config.ts "$dest"/playwright.live.config.ts "$dest"/capacitor.config.ts
  git -C "$REPO_ROOT" rev-parse "$GIT_REF" >"$dest/.source-commit"
}

if [ "$WITH_SOURCE" = "1" ]; then
  step "Snapshotting the application source ($GIT_REF) into app/"
  snapshot_source "$STAGE/app"
  ok "Source: $(du -sh "$STAGE/app" | cut -f1)"
fi

# --- 3. Offline images ----------------------------------------------------------
if [ "$OFFLINE" = "1" ]; then
  step "Building the application image (this takes a while)"
  docker info >/dev/null 2>&1 || die "The Docker daemon is not reachable."

  if [ "$WITH_SOURCE" = "1" ]; then
    BUILD_CTX="$STAGE/app"
  else
    BUILD_SRC="$OUT_DIR/.build-src-$NAME"
    rm -rf "$BUILD_SRC"
    snapshot_source "$BUILD_SRC"
    BUILD_CTX="$BUILD_SRC"
  fi

  VAPID_PUBLIC_KEY=""; VAPID_PRIVATE_KEY=""
  if [ "$WITH_PUSH" = "1" ]; then
    gen_vapid || die "Could not generate the VAPID keypair."
    info "VAPID public key for this bundle: ${VAPID_PUBLIC_KEY:0:20}…"
  else
    info "No Web-Push key (offline default — use --push to include one)."
  fi
  info "Neutral image: NEXT_PUBLIC_APP_URL=$NEUTRAL_APP_URL, no compiled-in name"

  # Git Bash (Windows build host): hand docker a native path for the context.
  ctx="$BUILD_CTX"
  command -v cygpath >/dev/null 2>&1 && ctx="$(cygpath -w "$ctx")"
  MSYS_NO_PATHCONV=1 docker build \
    --build-arg "NEXT_PUBLIC_VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY" \
    --build-arg "NEXT_PUBLIC_APP_URL=$NEUTRAL_APP_URL" \
    --build-arg "NEXT_PUBLIC_APP_NAME=" \
    --build-arg "TT_ONPREM_IMAGE=1" \
    -t "task-tracker:$VERSION" \
    "$ctx" || die "The image build failed."
  ok "task-tracker:$VERSION built"
  cleanup_build_src; BUILD_SRC=""

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
TT_VERSION=$VERSION
SOURCE_COMMIT=$(git -C "$REPO_ROOT" rev-parse "$GIT_REF")
BUILT_AT=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
# TOF-0795: nothing instance-specific is compiled in. The name is set at
# install time (APP_NAME, runtime); this is only the installer's suggestion.
APP_NAME_DEFAULT=$APP_NAME_DEFAULT
BUILD_APP_URL=$NEUTRAL_APP_URL
WITH_SOURCE=$WITH_SOURCE
# Images in this bundle (tag = what docker-compose.yml uses; digest = exact build).
IMAGE_APP=task-tracker:$VERSION
IMAGE_POSTGRES=postgres:16-alpine
IMAGE_POSTGRES_DIGEST=$(digest_of postgres:16-alpine)
IMAGE_CADDY=caddy:2-alpine
IMAGE_CADDY_DIGEST=$(digest_of caddy:2-alpine)
# Web Push: empty unless built with --push. The public key is COMPILED INTO
# task-tracker:$VERSION; the private key must be the one it was built with.
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

# --- 5. Neutrality check (TOF-0795) ----------------------------------------------------
# Internal material must never end up in the bundle.
step "Checking the bundle contents"
if [ -n "$(find "$STAGE" -name 'CUSTOMER_OPTIONS.md' -print)" ]; then
  die "docs/CUSTOMER_OPTIONS.md ended up in the bundle — it is internal."
fi
if [ "$WITH_SOURCE" = "0" ] && [ -e "$STAGE/app" ]; then
  die "app/ is in an offline bundle without --with-source."
fi
[ -f "$STAGE/NUTZUNGSHINWEISE.md" ] || die "NUTZUNGSHINWEISE.md is missing."
ok "No internal files, usage notice present"

# --- 6. Archives ----------------------------------------------------------------------
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

# --- 7. One-file installer (TOF-0795) -------------------------------------------------
if [ "$WITH_RUN" = "1" ]; then
  step "Building the one-file installer (.run)"
  bash "$BUNDLE_DIR/make-run.sh" "$STAGE" --out "$OUT_DIR" || die "make-run.sh failed."
fi

echo
ok "Done."
info "Folder: $STAGE"
info "Archive: $TARGZ"
if [ -f "$ZIP" ]; then info "Zip:     $ZIP"; fi
if [ "$WITH_RUN" = "1" ]; then info "Installer: $OUT_DIR/task-tracker-onprem-$VERSION.run (+ .sha256)"; fi
info "Copy the FOLDER onto the USB stick (or unpack the .tar.gz there:"
info "  tar -xzf $NAME.tar.gz) so install.sh can be run straight off the stick —"
info "or hand over the single .run file: sudo bash task-tracker-onprem-$VERSION.run"
