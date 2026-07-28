import { describe, it, expect } from "vitest";
import {
  isNativeApp,
  nativePlatform,
  takePhoto,
  saveToDevice,
  getNetworkStatus,
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
});
