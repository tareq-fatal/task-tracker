"use client";

import { useEffect } from "react";
import {
  isNativeApp,
  nativePlatform,
  registerPush,
  getPref,
  setPref,
} from "@/lib/native";
import { registerDeviceAction } from "@/actions/notifications";

/**
 * Runs once on native app start (no-op on web). It:
 *  - tags <html data-native="android"> so native-only CSS can target the shell,
 *  - records a persistent first-launch timestamp via Capacitor Preferences,
 *  - registers for push and syncs the device token to the server (dedup'd).
 * Renders nothing.
 */
export function NativeInit() {
  useEffect(() => {
    if (!isNativeApp()) return;

    const platform = nativePlatform();
    // Marker for native-only styling (safe-area padding, hiding desktop-only links).
    document.documentElement.dataset.native = platform;

    let cancelled = false;
    (async () => {
      // Stamp the very first launch once, in persistent native storage.
      const first = await getPref("tt.firstLaunch");
      if (!first) await setPref("tt.firstLaunch", new Date().toISOString());

      // Register for push; persist + sync the token, skipping redundant writes.
      await registerPush(async (token) => {
        if (cancelled || !token) return;
        const known = await getPref("tt.pushToken");
        if (known === token) return;
        await setPref("tt.pushToken", token);
        try {
          await registerDeviceAction(token, platform);
        } catch {
          /* offline / not signed in — will re-sync on next launch */
        }
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
