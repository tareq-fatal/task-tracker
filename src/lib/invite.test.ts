import { describe, expect, it } from "vitest";
import {
  INVITE_TTL_HOURS,
  checkNewPassword,
  hashInviteToken,
  inviteUrl,
  inviteUsable,
  isPlausibleInviteToken,
  mintInviteToken,
  originFromHeaders,
  unusablePasswordSecret,
} from "./invite";

// TOF-0783 (Tarek 28.10.2026): Einladungslink.
const headers = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });

describe("invite token", () => {
  it("mints a 32-byte base64url token and stores only its sha256", () => {
    const now = new Date("2026-10-28T12:00:00Z");
    const m = mintInviteToken(now);
    expect(m.raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isPlausibleInviteToken(m.raw)).toBe(true);
    expect(m.tokenHash).toBe(hashInviteToken(m.raw));
    expect(m.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(m.tokenHash).not.toContain(m.raw);
    expect(m.expiresAt.getTime() - now.getTime()).toBe(INVITE_TTL_HOURS * 3600_000);
  });

  it("two tokens never collide", () => {
    expect(mintInviteToken().raw).not.toBe(mintInviteToken().raw);
  });

  it("rejects implausible tokens without a DB lookup", () => {
    expect(isPlausibleInviteToken("")).toBe(false);
    expect(isPlausibleInviteToken(null)).toBe(false);
    expect(isPlausibleInviteToken("abc")).toBe(false);
    expect(isPlausibleInviteToken("a".repeat(42) + "/")).toBe(false);
  });

  it("unusable password secret is random hex", () => {
    const a = unusablePasswordSecret();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(unusablePasswordSecret());
  });
});

describe("inviteUsable", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  const user = { id: "u1", tenantId: "tA", deactivatedAt: null };
  const invite = { userId: "u1", tenantId: "tA", usedAt: null, expiresAt: new Date("2026-10-29T12:00:00Z") };

  it("fresh invite for the right user is usable", () => {
    expect(inviteUsable(invite, user, now)).toBe(true);
  });
  it("expired, exactly-at-expiry or used → invalid", () => {
    expect(inviteUsable({ ...invite, expiresAt: new Date("2026-10-28T11:59:59Z") }, user, now)).toBe(false);
    expect(inviteUsable({ ...invite, expiresAt: now }, user, now)).toBe(false);
    expect(inviteUsable({ ...invite, usedAt: new Date("2026-10-28T10:00:00Z") }, user, now)).toBe(false);
  });
  it("missing invite/user, other user or deactivated user → invalid", () => {
    expect(inviteUsable(null, user, now)).toBe(false);
    expect(inviteUsable(invite, null, now)).toBe(false);
    expect(inviteUsable(invite, { ...user, id: "u2" }, now)).toBe(false);
    expect(inviteUsable(invite, { ...user, deactivatedAt: new Date() }, now)).toBe(false);
  });
});

describe("checkNewPassword", () => {
  it("enforces minimum length and matching repetition", () => {
    expect(checkNewPassword("12345", "12345")).toBe("TOO_SHORT");
    expect(checkNewPassword("123456", "123457")).toBe("MISMATCH");
    expect(checkNewPassword("123456", "123456")).toBeNull();
  });
});

describe("invite link origin", () => {
  it("uses the forwarded host/proto from the reverse proxy", () => {
    expect(originFromHeaders(headers({ host: "internal:3000", "x-forwarded-host": "tasks.example.de", "x-forwarded-proto": "https" }), "https://fallback")).toBe("https://tasks.example.de");
  });
  it("plain host: https unless localhost", () => {
    expect(originFromHeaders(headers({ host: "tasks.example.de" }), "x")).toBe("https://tasks.example.de");
    expect(originFromHeaders(headers({ host: "localhost:3000" }), "x")).toBe("http://localhost:3000");
  });
  it("garbage host → fallback", () => {
    expect(originFromHeaders(headers({ host: "evil.com/path?x" }), "https://tasks.example.de/")).toBe("https://tasks.example.de");
    expect(originFromHeaders(headers({}), "https://tasks.example.de")).toBe("https://tasks.example.de");
  });
  it("builds /einladung/<token>", () => {
    expect(inviteUrl("https://a.de/", "TOKEN")).toBe("https://a.de/einladung/TOKEN");
  });
});
