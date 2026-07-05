import { describe, it, expect } from "vitest";
import {
  isNativeApp,
  nativePlatform,
  takePhoto,
  saveToDevice,
  getNetworkStatus,
  vibrate,
  notifyNative,
} from "./native";

// In the test (web/node) environment there is no native bridge, so every native
// capability must degrade gracefully — this guards the web build against the
// Capacitor plugins ever executing outside the APK.
describe("native bridge web fallbacks", () => {
  it("reports non-native on web", () => {
    expect(isNativeApp()).toBe(false);
    expect(nativePlatform()).toBe("web");
  });

  it("camera/file ops are no-ops off-device", async () => {
    expect(await takePhoto()).toBeNull();
    expect(await saveToDevice("x.txt", "data")).toBeNull();
  });

  it("network status falls back without the native plugin", async () => {
    const s = await getNetworkStatus();
    expect(typeof s.connected).toBe("boolean");
    expect(typeof s.type).toBe("string");
  });

  it("haptics degrade to navigator.vibrate on web (and never throw)", async () => {
    const calls: unknown[] = [];
    // jsdom has no vibrate; stub it to assert the web fallback path is used.
    (navigator as unknown as { vibrate: (p: unknown) => boolean }).vibrate = (
      p
    ) => {
      calls.push(p);
      return true;
    };
    await expect(vibrate("success")).resolves.toBeUndefined();
    await expect(vibrate("light")).resolves.toBeUndefined();
    expect(calls.length).toBe(2);
  });

  it("native system notification is a silent no-op on web", async () => {
    await expect(
      notifyNative({ title: "Hi", body: "there" })
    ).resolves.toBeUndefined();
  });
});
