import { describe, expect, it } from "vitest";
import { ownerOmitted, parseTenantInput } from "./tenant-input";

// TOF-0783 (Tarek 28.10.2026): Mandant ohne Eigentümer-Passwort.
const base = { name: "TOF Solution", slug: "tof-solution", primaryColor: "#123456" };
const owner = {
  ownerName: "Owner",
  ownerUsername: "Owner.One",
  ownerEmail: "Owner@Example.com",
  ownerPassword: "secret1",
};

describe("parseTenantInput — owner optional", () => {
  it("all owner fields empty → tenant only, no owner", () => {
    const r = parseTenantInput({ ...base, ownerName: "", ownerUsername: " ", ownerEmail: "", ownerPassword: "" });
    expect(r).toEqual({ ok: true, name: "TOF Solution", slug: "tof-solution", primaryColor: "#123456", owner: null });
  });

  it("owner fields missing entirely → tenant only", () => {
    const r = parseTenantInput({ name: " TOF ", slug: "TOF-Solution" });
    expect(r).toEqual({ ok: true, name: "TOF", slug: "tof-solution", primaryColor: "#4f46e5", owner: null });
  });

  it("tenant-only still validates name and slug", () => {
    expect(parseTenantInput({ name: "", slug: "tof" })).toEqual({ ok: false, error: "EMPTY" });
    expect(parseTenantInput({ name: "TOF", slug: "-bad" })).toEqual({ ok: false, error: "BAD_SLUG" });
    expect(parseTenantInput({ name: "TOF", slug: "a" })).toEqual({ ok: false, error: "BAD_SLUG" });
  });

  it("full owner → previous behaviour, normalised", () => {
    const r = parseTenantInput({ ...base, ...owner });
    expect(r).toEqual({
      ok: true,
      name: "TOF Solution",
      slug: "tof-solution",
      primaryColor: "#123456",
      owner: { name: "Owner", username: "owner.one", email: "owner@example.com", password: "secret1" },
    });
  });

  it("partially filled owner → old rules apply (no silent tenant-only)", () => {
    expect(parseTenantInput({ ...base, ownerUsername: "someone" })).toEqual({ ok: false, error: "EMPTY" });
    expect(parseTenantInput({ ...base, ownerPassword: "x" })).toEqual({ ok: false, error: "EMPTY" });
    expect(parseTenantInput({ ...base, ...owner, ownerUsername: "ab" })).toEqual({ ok: false, error: "BAD_USERNAME" });
    expect(parseTenantInput({ ...base, ...owner, ownerEmail: "nope" })).toEqual({ ok: false, error: "BAD_EMAIL" });
    expect(parseTenantInput({ ...base, ...owner, ownerPassword: "12345" })).toEqual({ ok: false, error: "WEAK_PASSWORD" });
  });

  it("error order unchanged: EMPTY before BAD_SLUG", () => {
    expect(parseTenantInput({ name: "", slug: "-", ...owner })).toEqual({ ok: false, error: "EMPTY" });
  });

  it("ownerOmitted treats whitespace as empty but a password of spaces as given", () => {
    expect(ownerOmitted({ ...base, ownerName: "  " })).toBe(true);
    expect(ownerOmitted({ ...base, ownerPassword: "  " })).toBe(false);
  });
});
