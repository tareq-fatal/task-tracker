#!/usr/bin/env bash
# =============================================================================
# Task Tracker — update / restart.
#
#   sudo ./update.sh --from /media/usb/task-tracker-onprem-v1.1.0  # new version from USB
#   sudo ./update.sh --rebuild        # rebuild from the source already installed
#   sudo ./update.sh --restart        # just restart (e.g. after editing .env)
#   sudo ./update.sh --rollback       # undo the last update
#
# Every update makes a full backup FIRST. If the new version does not come up
# healthy, the old images are put back automatically — an update can therefore
# not leave the customer without a working system.
#
# Database migrations are applied by the app container itself on boot; they are
# forward-only, which is why the pre-update backup matters.
#
# TOF-0794 (Tarek 31.10.2026): an installation made with install.sh --offline
# (TT_OFFLINE=1 in .env) updates offline automatically — the images come from
# the new bundle's images/ folder, nothing is built or downloaded.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

MODE="update"
FROM_BUNDLE=""
OFFLINE=0

usage() {
  cat <<'EOF'
Usage: sudo ./update.sh [options]

  --from <path>   Folder of a newer USB bundle to update from.
  --offline       With --from: load the images from that bundle's images/
                  folder instead of building. Automatic for installations
                  made with install.sh --offline.
  --rebuild       Rebuild the app image from the installed source (needs
                  an internet connection).
  --restart       Only restart the containers. Use after editing .env.
  --rollback      Restore the backup that the last update made.
  -h, --help      Show this help.
EOF
}

ORIG_ARGS=("$@")
while [ $# -gt 0 ]; do
  case "$1" in
    --from) FROM_BUNDLE="${2:-}"; shift 2 ;;
    --offline) OFFLINE=1; shift ;;
    --rebuild) MODE="rebuild"; shift ;;
    --restart) MODE="restart"; shift ;;
    --rollback) MODE="rollback"; shift ;;
    --yes|-y) TT_ASSUME_YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) err "Unknown option: $1"; usage; exit 1 ;;
  esac
done

require_root ${ORIG_ARGS[@]+"${ORIG_ARGS[@]}"}
require_installed

# TOF-0794: offline installations stay offline.
if [ "$OFFLINE" = "0" ] && [ "$(env_get TT_OFFLINE || true)" = "1" ] && [ "$MODE" = "update" ]; then
  OFFLINE=1
  info "Offline installation (TT_OFFLINE=1) — the images are loaded from the bundle."
fi

CURRENT_VERSION="$(env_get TT_VERSION || echo unknown)"
CURRENT_IMAGE="task-tracker:$CURRENT_VERSION"

wait_healthy() {
  local limit="${1:-120}" cid state
  for i in $(seq 1 "$limit"); do
    cid="$(dc ps -q app 2>/dev/null | sed -n '1p')"
    if [ -n "$cid" ]; then
      state="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo starting)"
      [ "$state" = "healthy" ] && return 0
      [ "$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null)" = "exited" ] && return 1
    fi
    sleep 2
  done
  return 1
}

# =============================================================================
# --restart
# =============================================================================
if [ "$MODE" = "restart" ]; then
  step "Restarting Task Tracker"
  dc up -d --no-build --force-recreate
  if wait_healthy 90; then
    ok "Task Tracker is running again."
  else
    err "The application did not come back up. Last log lines:"
    dc logs --tail 40 app >&2 || true
    exit 1
  fi
  exit 0
fi

# =============================================================================
# --rollback
# =============================================================================
if [ "$MODE" = "rollback" ]; then
  LAST="$(find "$TT_BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name 'pre-update-*' 2>/dev/null | sort | tail -n1)"
  [ -n "$LAST" ] || die "No pre-update backup found in $TT_BACKUP_DIR."
  step "Rolling back to $(basename "$LAST")"
  # TOF-0794 (Test 31.10.): a rollback also returns to the PREVIOUS VERSION, not
  # only the data. The version before the update is in the backup's MANIFEST;
  # its image is still on this server (update.sh does not remove it).
  OLD_VERSION="$(sed -n 's/^Version *: *//p' "$LAST/MANIFEST.txt" 2>/dev/null | head -n1 | tr -d ' \r')"
  if [ -n "$OLD_VERSION" ] && [ "$OLD_VERSION" != "unknown" ] && [ "$OLD_VERSION" != "$CURRENT_VERSION" ]; then
    if docker image inspect "task-tracker:$OLD_VERSION" >/dev/null 2>&1; then
      info "Version: $CURRENT_VERSION → back to $OLD_VERSION"
      ROLLBACK_TO_VERSION="$OLD_VERSION"
    else
      warn "The image of version $OLD_VERSION is no longer on this server — only the DATA"
      warn "is rolled back; the program stays at $CURRENT_VERSION. To return to $OLD_VERSION,"
      warn "run update.sh --from <the $OLD_VERSION bundle> afterwards."
    fi
  fi
  warn "This restores the database and files from before the last update."
  confirm "Continue?" n || die "Aborted."
  if [ -n "${ROLLBACK_TO_VERSION:-}" ]; then
    sed -i "s/^TT_VERSION=.*/TT_VERSION=$ROLLBACK_TO_VERSION/" "$TT_INSTALL_DIR/.env"
  fi
  exec "$SCRIPT_DIR/restore.sh" --from "$LAST" --yes
fi

# =============================================================================
# update / rebuild
# =============================================================================
step "Update — Task Tracker $CURRENT_VERSION"

NEW_VERSION="$CURRENT_VERSION"
if [ -n "$FROM_BUNDLE" ]; then
  [ -d "$FROM_BUNDLE" ] || die "Not a folder: $FROM_BUNDLE"
  [ -f "$FROM_BUNDLE/docker-compose.yml" ] || die "$FROM_BUNDLE does not look like a Task Tracker bundle."
  [ -f "$FROM_BUNDLE/VERSION" ] && NEW_VERSION="$(tr -d ' \t\n\r' <"$FROM_BUNDLE/VERSION")"
  info "New version on the stick: $NEW_VERSION"
  if [ "$NEW_VERSION" = "$CURRENT_VERSION" ]; then
    warn "That is the version already installed."
    confirm "Re-install it anyway?" n || die "Nothing to do."
  fi
  # TOF-0794: the instance name is compiled into a pre-built image.
  if [ "$OFFLINE" = "1" ]; then
    NEW_APP_NAME="$(build_info_get APP_NAME "$FROM_BUNDLE/images/build-info.env")"
    CUR_APP_NAME="$(env_get NEXT_PUBLIC_APP_NAME || true)"
    if [ "$NEW_APP_NAME" != "$CUR_APP_NAME" ]; then
      warn "The new bundle shows the name \"${NEW_APP_NAME:-<default>}\" (installed: \"${CUR_APP_NAME:-<default>}\")."
      confirm "Continue anyway?" y || die "Aborted — build a bundle with make-bundle.sh --offline --app-name \"$CUR_APP_NAME\"."
    fi
  fi
fi

# --- 1. Pre-update backup -------------------------------------------------------
step "Backup before the update"
"$SCRIPT_DIR/backup.sh" --keep 0 --quiet || die "The backup failed — the update was NOT started."
NEWEST="$(find "$TT_BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*-*' | sort | tail -n1)"
PRE_UPDATE="$TT_BACKUP_DIR/pre-update-$(timestamp)"
mv "$NEWEST" "$PRE_UPDATE"
ok "Saved to $PRE_UPDATE"

# Remember the current image so a failed update can be undone without touching
# the database at all (the fast path — only fall back to the backup if the
# migrations already ran).
ROLLBACK_IMAGE_ID="$(docker image inspect -f '{{.Id}}' "$CURRENT_IMAGE" 2>/dev/null || echo "")"

# --- 2. New files ----------------------------------------------------------------
if [ -n "$FROM_BUNDLE" ]; then
  step "Copying the new version into place"
  cp -f "$FROM_BUNDLE/docker-compose.yml" "$TT_INSTALL_DIR/"
  # --remove-destination: replace the files by NEW inodes. This very script is
  # one of them and bash reads it while running — overwriting it in place
  # would make bash continue in the middle of the new file (TOF-0794).
  cp -f --remove-destination "$FROM_BUNDLE"/{update.sh,backup.sh,restore.sh,uninstall.sh} "$TT_INSTALL_DIR/"
  # TOF-0794: invite.sh exists from bundle 1.1.0 on.
  if [ -f "$FROM_BUNDLE/invite.sh" ]; then
    cp -f --remove-destination "$FROM_BUNDLE/invite.sh" "$TT_INSTALL_DIR/"
  fi
  cp -rf "$FROM_BUNDLE/lib" "$TT_INSTALL_DIR/"
  cp -rf "$FROM_BUNDLE/templates" "$TT_INSTALL_DIR/"
  if [ -d "$FROM_BUNDLE/docs" ]; then
    mkdir -p "$TT_INSTALL_DIR/docs"
    find "$FROM_BUNDLE/docs" -maxdepth 1 -type f \( -name '*.pdf' -o -name '*.md' \) -exec cp -f {} "$TT_INSTALL_DIR/docs/" \;
  fi
  # docker-compose.yml (1.1.0+) mounts ./ca into caddy.
  mkdir -p "$TT_INSTALL_DIR/ca"
  chmod +x "$TT_INSTALL_DIR"/*.sh
  if [ "$OFFLINE" = "0" ] && [ -d "$FROM_BUNDLE/app" ]; then
    rm -rf "$TT_INSTALL_DIR/app"
    cp -r "$FROM_BUNDLE/app" "$TT_INSTALL_DIR/app"
  fi
  # Bump the version in .env so compose picks the new image tag.
  sed -i "s/^TT_VERSION=.*/TT_VERSION=$NEW_VERSION/" "$TT_INSTALL_DIR/.env"
  # TOF-0794: an offline image carries its own instance name — keep .env honest.
  if [ "$OFFLINE" = "1" ] && [ -f "$FROM_BUNDLE/images/build-info.env" ]; then
    NEW_APP_NAME="$(build_info_get APP_NAME "$FROM_BUNDLE/images/build-info.env")"
    if grep -q '^NEXT_PUBLIC_APP_NAME=' "$TT_INSTALL_DIR/.env"; then
      sed -i "s|^NEXT_PUBLIC_APP_NAME=.*|NEXT_PUBLIC_APP_NAME=$(sed_escape "$NEW_APP_NAME")|" "$TT_INSTALL_DIR/.env"
    else
      printf 'NEXT_PUBLIC_APP_NAME=%s\n' "$NEW_APP_NAME" >>"$TT_INSTALL_DIR/.env"
    fi
  fi
  ok "Files updated"
fi

# --- 3. Image ---------------------------------------------------------------------
if [ "$OFFLINE" = "1" ]; then
  [ -n "$FROM_BUNDLE" ] || die "--offline needs --from <bundle> (that is where the images are)."
  step "Loading the new images"
  shopt -s nullglob
  IMAGES=("$FROM_BUNDLE"/images/*.tar "$FROM_BUNDLE"/images/*.tar.gz)
  shopt -u nullglob
  [ "${#IMAGES[@]}" -gt 0 ] || die "No images found in $FROM_BUNDLE/images/."
  for f in "${IMAGES[@]}"; do
    info "Loading $(basename "$f") …"
    if [ "${f##*.}" = "gz" ]; then gunzip -c "$f" | docker load >/dev/null
    else docker load -i "$f" >/dev/null; fi
  done
  ok "Images loaded"
else
  step "Building the new application image (this takes a few minutes)"
  dc build app || die "The build failed — nothing was changed. The old version is still running."
  dc pull postgres caddy >/dev/null 2>&1 || warn "Could not refresh the PostgreSQL/Caddy images — using the local ones."
  ok "Image built"
fi

# --- 4. Swap in ---------------------------------------------------------------------
step "Switching over"
dc up -d --no-build
if wait_healthy 150; then
  ok "Task Tracker $NEW_VERSION is running"
else
  err "The new version did not become healthy. Last log lines:"
  dc logs --tail 60 app >&2 || true
  echo
  warn "Rolling back to $CURRENT_VERSION…"
  if [ -n "$ROLLBACK_IMAGE_ID" ]; then
    sed -i "s/^TT_VERSION=.*/TT_VERSION=$CURRENT_VERSION/" "$TT_INSTALL_DIR/.env"
    docker tag "$ROLLBACK_IMAGE_ID" "$CURRENT_IMAGE" >/dev/null 2>&1 || true
    dc up -d --no-build >/dev/null 2>&1 || true
    if wait_healthy 90; then
      ok "The old version is running again."
      warn "If the new version had already migrated the database, also run:"
      warn "  sudo ./restore.sh --from $PRE_UPDATE --yes"
      exit 1
    fi
  fi
  err "Automatic rollback did not work. Restore the pre-update backup:"
  err "  sudo ./restore.sh --from $PRE_UPDATE --yes"
  exit 1
fi

# --- 5. Tidy up ----------------------------------------------------------------------
docker image prune -f >/dev/null 2>&1 || true

echo
ok "Update complete: $CURRENT_VERSION → $NEW_VERSION"
info "The pre-update backup is kept at $PRE_UPDATE."
info "Undo this update with:  sudo ./update.sh --rollback"
