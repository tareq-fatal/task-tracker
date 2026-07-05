// Native-capability bridge for the Capacitor APK. Every function is a no-op (or
// web fallback) in the browser, so the same components run on web and native.
// Plugins are dynamically imported so the web bundle never pulls native code.
import { Capacitor } from "@capacitor/core";

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function nativePlatform(): "android" | "ios" | "web" {
  return Capacitor.getPlatform() as "android" | "ios" | "web";
}

/** Camera — returns a data URL (or null on web / when cancelled). */
export async function takePhoto(): Promise<string | null> {
  if (!isNativeApp()) return null;
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
  const photo = await Camera.getPhoto({
    quality: 80,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Prompt,
  });
  return photo.dataUrl ?? null;
}

/** Push — register and surface the device token (no-op on web). */
export async function registerPush(
  onToken: (token: string) => void
): Promise<void> {
  if (!isNativeApp()) return;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") return;
  await PushNotifications.register();
  PushNotifications.addListener("registration", (t) => onToken(t.value));
}

/** Filesystem — save a file to app storage; returns its uri (null on web). */
export async function saveToDevice(
  fileName: string,
  base64Data: string
): Promise<string | null> {
  if (!isNativeApp()) return null;
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const res = await Filesystem.writeFile({
    path: fileName,
    data: base64Data,
    directory: Directory.Documents,
  });
  return res.uri;
}

/** Persistent key/value — Capacitor Preferences on device, localStorage on web.
 * Survives app restarts on native (localStorage in the webview would too, but
 * Preferences is the platform-blessed store and is backed up with the app). */
export async function setPref(key: string, value: string): Promise<void> {
  if (!isNativeApp()) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* private mode / SSR — ignore */
    }
    return;
  }
  const { Preferences } = await import("@capacitor/preferences");
  await Preferences.set({ key, value });
}

export async function getPref(key: string): Promise<string | null> {
  if (!isNativeApp()) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  const { Preferences } = await import("@capacitor/preferences");
  const { value } = await Preferences.get({ key });
  return value ?? null;
}

/** Haptic feedback. Uses the Capacitor Haptics plugin on device (crisp, native
 * taptic patterns) and falls back to the Web Vibration API in the browser. A
 * no-op where neither exists, so callers never need to guard. */
export type HapticStyle = "light" | "medium" | "heavy" | "success" | "warning";

export async function vibrate(style: HapticStyle = "light"): Promise<void> {
  if (!isNativeApp()) {
    // Web fallback — navigator.vibrate (Android Chrome / the PWA). Durations
    // roughly mirror the native impact/notification feel.
    try {
      const nav = typeof navigator === "undefined" ? undefined : navigator;
      const pattern =
        style === "success"
          ? [12, 40, 18]
          : style === "warning"
            ? [20, 60, 20]
            : style === "heavy"
              ? 30
              : style === "medium"
                ? 18
                : 10;
      nav?.vibrate?.(pattern);
    } catch {
      /* unsupported — ignore */
    }
    return;
  }
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import(
      "@capacitor/haptics"
    );
    if (style === "success" || style === "warning") {
      await Haptics.notification({
        type: style === "success" ? NotificationType.Success : NotificationType.Warning,
      });
    } else {
      await Haptics.impact({
        style:
          style === "heavy"
            ? ImpactStyle.Heavy
            : style === "medium"
              ? ImpactStyle.Medium
              : ImpactStyle.Light,
      });
    }
  } catch {
    /* plugin missing (older APK) — ignore */
  }
}

/** Fire a system-tray (heads-up) notification via the Capacitor
 * LocalNotifications plugin. On web this is a no-op — web push / the in-app bell
 * cover that surface — so it is only meaningful inside the APK. Best-effort:
 * silently ignores permission denial or a missing plugin. */
export async function notifyNative(opts: {
  title: string;
  body?: string;
  id?: number;
}): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== "granted") return;
    }
    await LocalNotifications.schedule({
      notifications: [
        {
          // Keep ids in a small rotating range so we never overflow int32.
          id: opts.id ?? Math.floor((Date.now() % 100000) + 1),
          title: opts.title,
          body: opts.body ?? "",
          smallIcon: "ic_stat_icon_config_sample",
          // Immediate delivery.
        },
      ],
    });
  } catch {
    /* plugin missing / not permitted — ignore */
  }
}

export type NetState = { connected: boolean; type: string };

/** Network status — uses the native plugin on device, navigator on web. */
export async function getNetworkStatus(): Promise<NetState> {
  if (!isNativeApp()) {
    const online = typeof navigator === "undefined" ? true : navigator.onLine ?? true;
    return { connected: online, type: online ? "wifi" : "none" };
  }
  const { Network } = await import("@capacitor/network");
  const s = await Network.getStatus();
  return { connected: s.connected, type: s.connectionType };
}

/** Subscribe to connectivity changes. Returns an unsubscribe fn. */
export async function onNetworkChange(
  cb: (s: NetState) => void
): Promise<() => void> {
  if (!isNativeApp()) {
    const handler = () => {
      const online = navigator.onLine ?? true;
      cb({ connected: online, type: online ? "wifi" : "none" });
    };
    window.addEventListener("online", handler);
    window.addEventListener("offline", handler);
    return () => {
      window.removeEventListener("online", handler);
      window.removeEventListener("offline", handler);
    };
  }
  const { Network } = await import("@capacitor/network");
  const handle = await Network.addListener("networkStatusChange", (s) =>
    cb({ connected: s.connected, type: s.connectionType })
  );
  return () => handle.remove();
}
