# Mobile APK (PR-D — Capacitor)

A native Android shell (`net.coastshield.tasktracker`) that wraps the live
Task-Tracker PWA and adds native plugins.

## Why a URL shell (not a bundled web build)

OBJ-FSM is a static Vite SPA, so Capacitor bundles its `dist/`. Task Tracker is
a **server-rendered Next.js app** (server actions, Prisma, cookie sessions) and
**cannot** be exported to a static `webDir`. So the native app instead loads the
live site over https (`server.url` in `capacitor.config.ts`) and layers native
capabilities on top. The web app already ships as an installable PWA, so the
shell gets offline caching + install for free.

## Native capabilities (`src/lib/native.ts`)

All guarded by `isNativeApp()` → safe no-ops on web (unit-tested):

- **Camera** — `takePhoto()` (data URL) for task attachments
- **Push** — `registerPush(onToken)` (device token → server)
- **Files** — `saveToDevice(name, base64)` to Documents
- **Network** — `getNetworkStatus()` / `onNetworkChange(cb)`

## Build the APK (needs Android SDK + JDK 17)

This machine has no Android toolchain, so the binary is built where the SDK
exists — locally with Android Studio, or via the included CI workflow.

### Local
```bash
# one-time: JDK 17 + Android SDK (Android Studio) on PATH
npm ci
npm run cap:add:android        # scaffold android/ (first time only)
CAP_SERVER_URL=https://tasks.coastshield.net ./scripts/build-apk.sh debug
# → releases/task-tracker-v8.apk
```

`apk:release` produces an unsigned release APK — sign it with your keystore:
```bash
npm run apk:release
apksigner sign --ks my-release.keystore \
  --out releases/task-tracker-v8.apk \
  android/app/build/outputs/apk/release/app-release-unsigned.apk
```

### CI (GitHub Actions)
`.github/workflows/android.yml` builds the APK on `ubuntu-latest` (JDK 17 +
Android SDK) and uploads `task-tracker-v8.apk` as an artifact. Trigger it from
the **Actions** tab (workflow_dispatch) or by pushing a `v*` tag. *Requires the
repo to have a GitHub remote* (this repo currently has none — add one first).

## Status

- ✅ Capacitor integrated: config, plugins, `native.ts` bridge, scripts, CI, docs.
- ✅ Web build unaffected; native fallbacks unit-tested.
- ⏳ **APK binary not produced here** — no Android SDK/JDK on the build machine.
  Run the steps above on a machine with the SDK (or via CI) to emit
  `releases/task-tracker-v8.apk`.
