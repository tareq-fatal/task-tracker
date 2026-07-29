import { describe, it, expect } from "vitest";
import { parseDomains, emailMatchesDomains } from "./sso";
import { ALLOWED_MIME, MIME_EXTENSION } from "./validation";

// Regression tests for the security audit of 2026-07. Each block pins an
// invariant that a fix depends on — see docs/SECURITY_AUDIT_2026-07-27.md.

describe("SSO domain claims (cross-tenant account takeover)", () => {
  it("normalizes a comma list to lowercase, trimmed, non-empty entries", () => {
    expect(parseDomains(" Victim-Corp.com , foo.de ,, ")).toEqual([
      "victim-corp.com",
      "foo.de",
    ]);
    expect(parseDomains(null)).toEqual([]);
    expect(parseDomains("")).toEqual([]);
  });

  it("detects a collision between two tenants claiming the same domain", () => {
    // This is the check saveTenantSsoAction performs before persisting.
    const otherTenants = ["victimcorp.com, partner.io", "unrelated.net"];
    const taken = new Set(otherTenants.flatMap(parseDomains));
    const wanted = parseDomains("VictimCorp.com");
    expect(wanted.find((d) => taken.has(d))).toBe("victimcorp.com");
  });

  it("does not treat a suffix as a claim on the parent domain", () => {
    // A substring check (`ssoDomains contains "corp.com"`) would wrongly match
    // "evilcorp.com". Exact per-entry comparison must not.
    const taken = new Set(parseDomains("evilcorp.com"));
    expect(parseDomains("corp.com").some((d) => taken.has(d))).toBe(false);
  });

  it("matches an email only against a whole domain entry", () => {
    expect(emailMatchesDomains("a@victimcorp.com", "victimcorp.com")).toBe(true);
    expect(emailMatchesDomains("a@evilcorp.com", "victimcorp.com")).toBe(false);
    expect(emailMatchesDomains("a@victimcorp.com", null)).toBe(false);
    expect(emailMatchesDomains("", "victimcorp.com")).toBe(false);
  });
});

describe("attachment extension is derived from the validated MIME", () => {
  it("maps every accepted MIME type to an extension", () => {
    for (const mime of ALLOWED_MIME) {
      expect(MIME_EXTENSION[mime], `no extension for ${mime}`).toBeTruthy();
    }
  });

  it("never yields an extension the browser would render as active content", () => {
    const dangerous = [".html", ".htm", ".svg", ".xhtml", ".js", ".mjs", ".php"];
    for (const ext of Object.values(MIME_EXTENSION)) {
      expect(dangerous).not.toContain(ext);
    }
  });

  it("rejects a type outside the allowlist, so no filename-derived extension survives", () => {
    // uploadAttachmentAction bails with BAD_TYPE when the lookup misses.
    expect(MIME_EXTENSION["text/html"]).toBeUndefined();
    expect(MIME_EXTENSION["image/svg+xml"]).toBeUndefined();
  });
});
