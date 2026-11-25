import { describe, it, expect } from "vitest";
import { createRevealToken, verifyRevealToken, revealTokenExpiry, REVEAL_MAX_MS } from "./reveal-token";

const SECRET = ["unit", "test", "secret"].join("-");
const SESSION = "session-abc";
const NOW = 1_800_000_000_000;

describe("reveal token", () => {
  it("verifies for the same session within its lifetime", () => {
    const tok = createRevealToken(SECRET, SESSION, NOW);
    expect(verifyRevealToken(tok, SECRET, SESSION, NOW + 1000)).toBe(true);
    expect(revealTokenExpiry(tok)).toBe(NOW + REVEAL_MAX_MS);
  });

  it("is bound to the session — a copied cookie is useless elsewhere", () => {
    const tok = createRevealToken(SECRET, SESSION, NOW);
    expect(verifyRevealToken(tok, SECRET, "other-session", NOW + 1000)).toBe(false);
    expect(verifyRevealToken(tok, SECRET, undefined, NOW + 1000)).toBe(false);
  });

  it("expires after at most 30 minutes and never lives longer", () => {
    const tok = createRevealToken(SECRET, SESSION, NOW, 10 * REVEAL_MAX_MS);
    expect(revealTokenExpiry(tok)).toBe(NOW + REVEAL_MAX_MS);
    expect(verifyRevealToken(tok, SECRET, SESSION, NOW + REVEAL_MAX_MS)).toBe(false);
  });

  it("rejects tampering, foreign secrets and garbage", () => {
    const tok = createRevealToken(SECRET, SESSION, NOW);
    const [v, exp, sig] = tok.split(".");
    // Ablauf verlängert, Signatur alt → ungültig
    expect(verifyRevealToken(`${v}.${Number(exp) + 1}.${sig}`, SECRET, SESSION, NOW)).toBe(false);
    expect(verifyRevealToken(tok, "anderes-secret", SESSION, NOW)).toBe(false);
    expect(verifyRevealToken(tok, undefined, SESSION, NOW)).toBe(false);
    for (const bad of ["", "v1", "v1.x.y", "v2." + exp + "." + sig, `v1.${exp}.${sig}x`]) {
      expect(verifyRevealToken(bad, SECRET, SESSION, NOW)).toBe(false);
    }
  });

  it("rejects a forged far-future expiry even with a valid-looking format", () => {
    expect(verifyRevealToken(`v1.${NOW + 365 * 86400000}.abc`, SECRET, SESSION, NOW)).toBe(false);
  });
});
