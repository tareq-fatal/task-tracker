# Releases

`task-tracker-v8.apk` is produced by the Capacitor build, **not** committed from
this dev machine (it has no Android SDK/JDK).

Build it with:

```bash
./scripts/build-apk.sh debug     # → releases/task-tracker-v8.apk
```

or via the **Build Android APK** GitHub Actions workflow (artifact:
`task-tracker-v8-apk`). See `docs/MOBILE-APK.md`.
