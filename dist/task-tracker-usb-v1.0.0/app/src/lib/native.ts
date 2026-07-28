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
