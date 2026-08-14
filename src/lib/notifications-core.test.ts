import { describe, it, expect } from "vitest";
import {
  defaultPrefs,
  isQuietHours,
  resolveChannels,
  parseMentions,
  anyChannelEnabled,
  isNotificationEvent,
} from "./notifications-core";

describe("isNotificationEvent / defaultPrefs", () => {
  it("validates event types", () => {
    expect(isNotificationEvent("assigned")).toBe(true);
    expect(isNotificationEvent("nope")).toBe(false);
  });
  it("in-app on by default; email on for what is addressed at a person", () => {
    // Geändert am 14.08.2026 (TOF-0387): die drei Ereignisse, die jemanden
    // direkt ansprechen, kommen auch per E-Mail an — sonst hängt die Regel
    // „fertig → @tarekfatal → Zur Prüfung" daran, dass er die App offen hat.
    // Jede davon bleibt pro Benutzer abschaltbar.
    expect(defaultPrefs("mention")).toMatchObject({ inApp: true, email: true });
    expect(defaultPrefs("assigned").email).toBe(true);
    expect(defaultPrefs("review").email).toBe(true);
    expect(defaultPrefs("due_soon").email).toBe(true);
    expect(defaultPrefs("overdue").email).toBe(true);
    // Alltagsrauschen bleibt opt-in.
    expect(defaultPrefs("comment")).toMatchObject({ inApp: true, email: false });
    expect(defaultPrefs("status").email).toBe(false);
    expect(defaultPrefs("reaction").email).toBe(false);
  });
});

describe("isQuietHours", () => {
  it("off when unset", () => {
    expect(isQuietHours(3, null, null)).toBe(false);
    expect(isQuietHours(3, 22, null)).toBe(false);
  });
  it("same-day window", () => {
    expect(isQuietHours(13, 9, 17)).toBe(true);
    expect(isQuietHours(8, 9, 17)).toBe(false);
    expect(isQuietHours(17, 9, 17)).toBe(false); // end exclusive
  });
  it("wraps past midnight (22→7)", () => {
    expect(isQuietHours(23, 22, 7)).toBe(true);
    expect(isQuietHours(3, 22, 7)).toBe(true);
    expect(isQuietHours(7, 22, 7)).toBe(false);
    expect(isQuietHours(12, 22, 7)).toBe(false);
  });
});

describe("resolveChannels", () => {
  const all = { inApp: true, webPush: true, email: true, native: true };
  it("delivers everything outside quiet hours", () => {
    expect(resolveChannels(all, { hour: 12, quietStart: 22, quietEnd: 7 })).toEqual(all);
  });
  it("suppresses push/email/native during quiet hours, keeps in-app", () => {
    expect(resolveChannels(all, { hour: 3, quietStart: 22, quietEnd: 7 })).toEqual({
      inApp: true,
      webPush: false,
      email: false,
      native: false,
    });
  });
  it("respects disabled channels", () => {
    const prefs = { inApp: true, webPush: false, email: true, native: false };
    expect(resolveChannels(prefs, { hour: 12 })).toEqual(prefs);
  });
  it("anyChannelEnabled", () => {
    expect(anyChannelEnabled({ inApp: false, webPush: false, email: false, native: false })).toBe(false);
    expect(anyChannelEnabled({ inApp: true, webPush: false, email: false, native: false })).toBe(true);
  });
});

describe("parseMentions", () => {
  it("extracts unique lowercased usernames", () => {
    expect(parseMentions("hey @alice and @Bob, cc @alice")).toEqual(["alice", "bob"]);
  });
  it("ignores emails and mid-word @", () => {
    expect(parseMentions("mail me at a@b.com")).toEqual([]);
    expect(parseMentions("no@mention here")).toEqual([]);
  });
  it("handles start-of-string mention", () => {
    expect(parseMentions("@charlie ping")).toEqual(["charlie"]);
  });
});
