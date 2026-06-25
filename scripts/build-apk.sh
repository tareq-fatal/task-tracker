#!/usr/bin/env bash
# Build the Task Tracker Android APK (run on a machine with the Android SDK + JDK 17).
# The app shell loads the live PWA (https://tasks.coastshield.net) via Capacitor.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${CAP_SERVER_URL:=https://tasks.coastshield.net}"
export CAP_SERVER_URL
echo "▶ Target server: $CAP_SERVER_URL"

# 1. Scaffold the android project once (idempotent).
if [ ! -d android ]; then
  echo "▶ Adding android platform…"
  npx cap add android
fi

# 2. Sync web config + plugins into the native project.
npx cap sync android

# 3. Build the APK.
MODE="${1:-debug}"   # debug | release
cd android
if [ "$MODE" = "release" ]; then
  ./gradlew assembleRelease
  OUT="app/build/outputs/apk/release/app-release-unsigned.apk"
else
  ./gradlew assembleDebug
  OUT="app/build/outputs/apk/debug/app-debug.apk"
fi
cd ..

DEST="releases/task-tracker-v8.apk"
cp "android/$OUT" "$DEST"
echo "✅ APK → $DEST"
echo "   (release builds must be signed with your keystore before distribution)"
