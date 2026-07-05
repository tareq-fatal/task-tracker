#!/usr/bin/env bash
# Build the previous (main) image and the current image, then print a size
# comparison. Requires a working Docker daemon.
#
#   ./scripts/docker-size-compare.sh
#
# "before" is built from a detached worktree checked out at origin/main (its
# Dockerfile + .dockerignore); "after" is the current working tree.
set -euo pipefail

BEFORE_TAG="task-tracker:before"
AFTER_TAG="task-tracker:after"
WT="$(mktemp -d)/tt-before"

cleanup() { git worktree remove --force "$WT" 2>/dev/null || true; }
trap cleanup EXIT

echo "==> Building AFTER ($AFTER_TAG) from working tree…"
docker build -t "$AFTER_TAG" .

echo "==> Building BEFORE ($BEFORE_TAG) from main…"
git worktree add -f "$WT" main >/dev/null
docker build -t "$BEFORE_TAG" "$WT"

echo
echo "==> Image sizes:"
docker images --format '{{.Repository}}:{{.Tag}}\t{{.Size}}' \
  | grep -E "task-tracker:(before|after)" | sort
