import { describe, it, expect } from "vitest";
import { notifVisual } from "./notif-visual";
import { NOTIFICATION_EVENTS } from "./notifications-core";

describe("notifVisual", () => {
  it("maps every notification event to an icon + coloured chip", () => {
    for (const ev of NOTIFICATION_EVENTS) {
      const v = notifVisual(ev);
      expect(v.icon).toBeTruthy();
      expect(v.circle).toMatch(/^bg-/);
    }
  });

  it("falls back for unknown types", () => {
    const v = notifVisual("does_not_exist");
    expect(v.icon).toBe("bell");
    expect(v.circle).toBe("bg-gray-400");
  });
});
